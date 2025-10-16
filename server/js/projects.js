const { supabase } = require('../config/supabase');
const logger = require('../config/logger');

// Cache for active projects (reduces DB queries)
const PROJECT_CACHE = {};

EvalKey = async (data) => {
  const socket = SOCKET_LIST[data.id];
  const key = data.key.toLowerCase();

  if (!socket.userId) {
    socket.emit('notif', { msg: 'must be logged in to use projects' });
    return;
  }

  try {
    // Check if project exists in database
    const { data: projects, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('key', key)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows
      logger.error('Project fetch error', { error: fetchError.message, key });
      socket.emit('notif', { msg: 'error loading project' });
      return;
    }

    let project = projects;

    if (!project) {
      // Project doesn't exist, create it
      const { data: newProject, error: createError } = await supabase
        .from('projects')
        .insert({
          key: key,
          locked: false,
          user_list: [socket.userId],
          created_by: socket.userId,
        })
        .select()
        .single();

      if (createError) {
        logger.error('Project creation error', { error: createError.message, key });
        socket.emit('notif', { msg: 'error creating project' });
        return;
      }

      project = newProject;

      // Add log entry
      await supabase.from('project_logs').insert({
        project_id: project.id,
        username: socket.name,
        action: 'project_created',
        body: `project created by @${socket.name}`,
        location: socket.loc
          ? {
              latitude: socket.loc.coords?.latitude,
              longitude: socket.loc.coords?.longitude,
              city: socket.loc.address?.city,
              region: socket.loc.address?.region,
            }
          : null,
      });

      socket.emit('chat', { msg: `new project ${sp_project(key)} created` });
      logger.info('Project created', { key, userId: socket.userId });
    }

    // Check access
    if (
      project.locked &&
      project.created_by !== socket.userId &&
      !project.user_list.includes(socket.userId)
    ) {
      socket.emit('notif', { msg: `access to project ${sp_project(key)} denied` });
      return;
    }

    // Load project items with geometries as text
    const { data: items, error: itemsError } = await supabase.rpc('get_project_items', {
      p_project_id: project.id
    });

    if (itemsError) {
      logger.error('Items fetch error', { error: itemsError.message, projectId: project.id });
    }

    // Format data for client (backward compatible)
    const formattedProject = await formatProjectForClient(project, items || []);

    // Store in cache
    PROJECT_CACHE[key] = project;

    // Store project ID on socket
    SOCKET_LIST[data.id].key = key;
    SOCKET_LIST[data.id].projectId = project.id;

    socket.emit('chat', { msg: `opening project ${sp_project(key)}` });
    socket.emit('project', { project: formattedProject });

    // Add log entry for opening
    await supabase.from('project_logs').insert({
      project_id: project.id,
      username: socket.name,
      action: 'project_opened',
      body: `project opened by @${socket.name}`,
    });

    logger.info('Project opened', { key, userId: socket.userId });
  } catch (error) {
    logger.error('EvalKey exception', { error: error.message, key });
    socket.emit('notif', { msg: 'error with project' });
  }
};

// Format project data for client (backward compatible with old structure)
async function formatProjectForClient(project, items) {
  const data = {};
  const loc = [];
  const ent = [];
  const org = [];

  items.forEach((item) => {
    const itemData = {
      name: item.name,
      description: item.description,
      links: item.links || [],
      notes: item.notes || [],
      ...item.data, // Spread JSONB data
    };

    // Add geospatial data if it's a location
    if (item.type === 'location') {
      if (item.coords_text) {
        // Parse WKT text format: POINT(lng lat)
        const coordsMatch = item.coords_text.match(/POINT\(([^ ]+) ([^ ]+)\)/);
        if (coordsMatch) {
          itemData.coords = {
            longitude: Number.parseFloat(coordsMatch[1]),
            latitude: Number.parseFloat(coordsMatch[2]),
          };
        }
      }
      if (item.bbox_text) {
        // Parse WKT polygon format: POLYGON((lng lat, lng lat, ...))
        const bboxMatch = item.bbox_text.match(/POLYGON\(\(([^)]+)\)\)/);
        if (bboxMatch) {
          const coords = bboxMatch[1].split(',').map((pair) => {
            const [lng, lat] = pair.trim().split(' ');
            return [Number.parseFloat(lng), Number.parseFloat(lat)];
          });
          itemData.bbox = coords;
        }
      }
    }

    data[item.id] = itemData;

    // Categorize by type
    if (item.type === 'location') loc.push(item.id);
    else if (item.type === 'entity') ent.push(item.id);
    else if (item.type === 'organization') org.push(item.id);
  });

  return {
    locked: project.locked,
    userlist: project.user_list,
    data: data,
    loc: loc,
    ent: ent,
    org: org,
    log: [], // Could load from project_logs if needed
  };
}

EvalAdd = async (input) => {
  const socket = SOCKET_LIST[input.id];
  const str = input.item.split(' ');

  if (!socket.projectId) {
    socket.emit('notif', { msg: 'no #project open' });
    return;
  }

  if (!socket.userId) {
    socket.emit('notif', { msg: 'must be logged in' });
    return;
  }

  try {
    if (str[0] === 'loc') {
      // Add location by address
      const addr = input.item.split('loc ')[1];
      const geocodeData = await getCoords(addr);

      if (!geocodeData) {
        socket.emit('notif', { msg: 'location not found' });
        return;
      }

      const name = geocodeData.formattedAddress.split(',')[0].toLowerCase();

      // Build item data
      const itemData = {
        address: geocodeData.formattedAddress,
        neighbourhood: geocodeData.neighbourhood,
        city: geocodeData.city,
        district: geocodeData.district,
        zipcode: geocodeData.zipcode,
        state: geocodeData.state,
        country: geocodeData.country,
      };

      // Always save coordinates as a point
      const coordsValue = `POINT(${geocodeData.longitude} ${geocodeData.latitude})`;
      
      // Optionally save bbox for areas (e.g. cities, neighborhoods)
      // Only save bbox if it's significantly large (not just a building)
      let bboxValue = null;
      if (geocodeData.extra?.bbox && Array.isArray(geocodeData.extra.bbox)) {
        const [w, s, e, n] = geocodeData.extra.bbox;
        const width = Math.abs(e - w);
        const height = Math.abs(n - s);
        
        // Only save bbox if area is > 0.01 degrees (~1km)
        if (width > 0.01 || height > 0.01) {
          bboxValue = `POLYGON((${w} ${n}, ${e} ${n}, ${e} ${s}, ${w} ${s}, ${w} ${n}))`;
        }
      }

      // Insert into database
      const { error: insertError } = await supabase
        .from('items')
        .insert({
          project_id: socket.projectId,
          name: name,
          type: 'location',
          coords: coordsValue,
          bbox: bboxValue,
          data: itemData,
          added_by: socket.userId,
        })
        .select()
        .single();

      if (insertError) {
        logger.error('Item insert error', { error: insertError.message });
        socket.emit('notif', { msg: 'error adding location' });
        return;
      }

      // Add log entry
      await supabase.from('project_logs').insert({
        project_id: socket.projectId,
        username: socket.name,
        action: 'location_added',
        body: `loc !${name} added by @${socket.name}`,
      });

      socket.emit('chat', { msg: `loc ${sp_item(name)} added to ${sp_project(socket.key)}` });
      logger.info('Location added', { name, projectId: socket.projectId, userId: socket.userId });

      // Reload project
      await reloadProject(socket);
    } else if (str[0] === 'coords') {
      // Add location by coordinates
      const coordsStr = input.item.split('coords ')[1];
      const latlng = coordsStr.split(',');
      const lat = Number.parseFloat(latlng[0]);
      const lng = Number.parseFloat(latlng[1]);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        socket.emit('notif', { msg: 'invalid coordinates' });
        return;
      }

      // Try to get address
      const geocodeData = await hasAddress(lat, lng);
      let name = 'location';
      let itemData = {};

      if (geocodeData) {
        name = (geocodeData.formattedAddress?.split(',')[0] || 'location').toLowerCase();
        itemData = {
          address: geocodeData.formattedAddress,
          city: geocodeData.city,
          country: geocodeData.country,
        };
      }

      const coordsValue = `POINT(${lng} ${lat})`;

      const { error: insertError } = await supabase
        .from('items')
        .insert({
          project_id: socket.projectId,
          name: name,
          type: 'location',
          coords: coordsValue,
          data: itemData,
          added_by: socket.userId,
        })
        .select()
        .single();

      if (insertError) {
        logger.error('Item insert error', { error: insertError.message });
        socket.emit('notif', { msg: 'error adding location' });
        return;
      }

      // Add log entry
      await supabase.from('project_logs').insert({
        project_id: socket.projectId,
        username: socket.name,
        action: 'location_added',
        body: `loc !${name} added by @${socket.name}`,
      });

      socket.emit('chat', { msg: `loc ${sp_item(name)} added to ${sp_project(socket.key)}` });
      logger.info('Location added by coords', { name, lat, lng, projectId: socket.projectId });

      // Reload project
      await reloadProject(socket);
    }
  } catch (error) {
    logger.error('EvalAdd exception', { error: error.message });
    socket.emit('notif', { msg: 'error adding item' });
  }
};

// Helper to reload project data
async function reloadProject(socket) {
  if (!socket.projectId) return;

  try {
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', socket.projectId)
      .single();

    const { data: items } = await supabase.rpc('get_project_items', {
      p_project_id: socket.projectId
    });

    const formattedProject = await formatProjectForClient(project, items || []);
    socket.emit('project', { project: formattedProject });
  } catch (error) {
    logger.error('Reload project error', { error: error.message });
  }
}

EvalItem = async (input) => {
  const socket = SOCKET_LIST[input.id];

  if (!socket.projectId) {
    socket.emit('notif', { msg: 'no #project open' });
    return;
  }

  try {
    if (input.item.includes(' +')) {
      // Adding data to an item
      const str = input.item.split(' +');
      const itemName = str[0].toLowerCase();
      const command = str[1].split(' ');

      // Find item
      // Get all items and filter by name (since RPC doesn't support eq chaining)
      const { data: allItems, error: findError } = await supabase.rpc('get_project_items', {
        p_project_id: socket.projectId
      });
      const items = allItems?.filter(i => i.name === itemName);

      if (findError || !items || items.length === 0) {
        socket.emit('chat', { msg: '<span class="greyout">item not found</span>' });
        return;
      }

      const item = items[0];

      if (command[0] === 'desc') {
        // Add description
        const desc = str[1].split('desc ')[1];

        const { error: updateError } = await supabase
          .from('items')
          .update({ description: desc })
          .eq('id', item.id);

        if (updateError) {
          logger.error('Item update error', { error: updateError.message });
          socket.emit('notif', { msg: 'error updating item' });
          return;
        }

        socket.emit('chat', { msg: `description added to ${sp_item(itemName)}` });
        await reloadProject(socket);
    }
  } else {
      // Query items
      const searchTerm = input.item.toLowerCase();

      // Get all items and filter by search term
      const { data: allItems, error: searchError } = await supabase.rpc('get_project_items', {
        p_project_id: socket.projectId
      });
      const items = allItems?.filter(i => 
        i.name === searchTerm || i.name.toLowerCase().includes(searchTerm.toLowerCase())
      );

      if (searchError) {
        logger.error('Item search error', { error: searchError.message });
        socket.emit('notif', { msg: 'error searching items' });
        return;
      }

      if (!items || items.length === 0) {
        socket.emit('chat', { msg: '<span class="greyout">item not found</span>' });
      } else if (items.length === 1) {
        const item = items[0];
        let out = `${sp_item(item.name)} [${item.type}]:<br>`;

        if (item.description) {
          out += `<i>${item.description}</i><br>`;
        } else {
          out += `<span class="greyout"><i>!${item.name} +desc [description...]</i></span><br>`;
        }

        if (item.type === 'location' && item.data) {
          if (item.data.address) {
            out += `address: ${item.data.address}<br>`;
          }
          if (item.data.city) {
            out += `city: ${item.data.city}<br>`;
          }
        }

        if (item.tags && item.tags.length > 0) {
          out += `tags: ${item.tags.join(', ')}<br>`;
        }

        if (item.links && item.links.length > 0) {
          out += 'links:<br>';
          item.links.forEach((link) => {
            out += `- ${link}<br>`;
          });
        }

        out += '<------------------------------------>';
        socket.emit('chat', { msg: out });
      } else {
        let out = `items found (${items.length}):`;
        items.forEach((item) => {
          out += `<br>${sp_item(item.name)} [${item.type}]`;
        });
        socket.emit('chat', { msg: out });
      }
    }
  } catch (error) {
    logger.error('EvalItem exception', { error: error.message });
    socket.emit('notif', { msg: 'error with item' });
  }
};
