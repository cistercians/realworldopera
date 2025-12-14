const logger = require('../config/logger');

// In-memory project storage (no Supabase)
const MEMORY_PROJECTS = {};
const MEMORY_ITEMS = {};

// Export for other modules
global.MEMORY_PROJECTS = MEMORY_PROJECTS;
global.MEMORY_ITEMS = MEMORY_ITEMS;

EvalKey = async (data) => {
  const socket = SOCKET_LIST[data.id];
  const key = data.key.toLowerCase();

  if (!socket.userId) {
    socket.emit('notif', { msg: 'must be logged in to use projects' });
    return;
  }

  try {
    let project = MEMORY_PROJECTS[key];

    if (!project) {
      // Project doesn't exist, create it
      project = {
        id: `proj-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        key: key,
        locked: false,
        user_list: [socket.userId],
        created_by: socket.userId,
        created_at: new Date().toISOString(),
      };

      MEMORY_PROJECTS[key] = project;
      MEMORY_ITEMS[project.id] = [];

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

    // Format project data for client
    const items = MEMORY_ITEMS[project.id] || [];
    const formattedProject = formatProjectForClient(project, items);

    // Store project on socket
    SOCKET_LIST[data.id].key = key;
    SOCKET_LIST[data.id].projectId = project.id;

    // Join project room for notifications
    socket.join(`project:${project.id}`);

    socket.emit('chat', { msg: `opening project ${sp_project(key)}` });
    socket.emit('project', { project: formattedProject });

    logger.info('Project opened', { key, userId: socket.userId });
  } catch (error) {
    logger.error('EvalKey exception', { error: error.message, key });
    socket.emit('notif', { msg: 'error with project' });
  }
};

// Format project data for client (backward compatible with old structure)
function formatProjectForClient(project, items) {
  const data = {};
  const loc = [];
  const ent = [];
  const org = [];

  items.forEach((item) => {
    const itemData = {
      name: item.name,
      description: item.description || '',
      links: item.links || [],
      notes: item.notes || [],
      ...item.data, // Spread additional data
    };

    // Add geospatial data if it's a location
    if (item.coords) {
      itemData.coords = item.coords;
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
    log: [], // Simplified - no logs
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
      const item = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: name,
        type: 'location',
        description: null,
        links: [],
        notes: [],
        data: {
          address: geocodeData.formattedAddress,
          neighbourhood: geocodeData.neighbourhood,
          city: geocodeData.city,
          district: geocodeData.district,
          zipcode: geocodeData.zipcode,
          state: geocodeData.state,
          country: geocodeData.country,
        },
        coords: {
          latitude: geocodeData.latitude,
          longitude: geocodeData.longitude,
        },
        added_by: socket.userId,
        created_at: new Date().toISOString(),
      };

      // Add to memory
      if (!MEMORY_ITEMS[socket.projectId]) {
        MEMORY_ITEMS[socket.projectId] = [];
      }
      MEMORY_ITEMS[socket.projectId].push(item);

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

      const item = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: name,
        type: 'location',
        description: null,
        links: [],
        notes: [],
        data: itemData,
        coords: {
          latitude: lat,
          longitude: lng,
        },
        added_by: socket.userId,
        created_at: new Date().toISOString(),
      };

      // Add to memory
      if (!MEMORY_ITEMS[socket.projectId]) {
        MEMORY_ITEMS[socket.projectId] = [];
      }
      MEMORY_ITEMS[socket.projectId].push(item);

      socket.emit('chat', { msg: `loc ${sp_item(name)} added to ${sp_project(socket.key)}` });
      logger.info('Location added by coords', { name, lat, lng, projectId: socket.projectId });

      // Reload project
      await reloadProject(socket);
    } else if (str[0] === 'entity') {
      // Add entity
      const entityName = str.slice(1).join(' ');
      
      if (!entityName) {
        socket.emit('notif', { msg: 'please provide a name' });
        return;
      }

      const item = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: entityName.toLowerCase(),
        type: 'entity',
        description: null,
        links: [],
        notes: [],
        data: {},
        added_by: socket.userId,
        created_at: new Date().toISOString(),
      };

      if (!MEMORY_ITEMS[socket.projectId]) {
        MEMORY_ITEMS[socket.projectId] = [];
      }
      MEMORY_ITEMS[socket.projectId].push(item);

      socket.emit('chat', { msg: `entity ${sp_item(entityName)} added to ${sp_project(socket.key)}` });
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
    const project = Object.values(MEMORY_PROJECTS).find(p => p.id === socket.projectId);
    if (!project) return;

    const items = MEMORY_ITEMS[socket.projectId] || [];
    const formattedProject = formatProjectForClient(project, items);
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
    const items = MEMORY_ITEMS[socket.projectId] || [];

    if (input.item.includes(' +')) {
      // Adding data to an item
      const str = input.item.split(' +');
      const itemName = str[0].toLowerCase();
      const command = str[1].split(' ');

      // Find item
      const item = items.find(i => i.name === itemName);

      if (!item) {
        socket.emit('chat', { msg: '<span class="greyout">item not found</span>' });
        return;
      }

      if (command[0] === 'desc') {
        // Add description
        const desc = str[1].split('desc ')[1];
        item.description = desc;

        socket.emit('chat', { msg: `description added to ${sp_item(itemName)}` });
        await reloadProject(socket);
      }
    } else {
      // Query items
      const searchTerm = input.item.toLowerCase();
      const matches = items.filter(i => 
        i.name === searchTerm || i.name.toLowerCase().includes(searchTerm.toLowerCase())
      );

      if (matches.length === 0) {
        socket.emit('chat', { msg: '<span class="greyout">item not found</span>' });
      } else if (matches.length === 1) {
        const item = matches[0];
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

        if (item.links && item.links.length > 0) {
          out += 'links:<br>';
          item.links.forEach((link) => {
            out += `- ${link}<br>`;
          });
        }

        out += '<------------------------------------>';
        socket.emit('chat', { msg: out });
      } else {
        let out = `items found (${matches.length}):`;
        matches.forEach((item) => {
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

module.exports = {
  formatProjectForClient,
};
