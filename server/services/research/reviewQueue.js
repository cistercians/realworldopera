const { supabase } = require('../../config/supabase');
const logger = require('../../config/logger');
const { extractAndGeocode } = require('../nlp/locationParser');

/**
 * Review Queue Service
 * Handles user review and approval workflow
 */

/**
 * Get pending review items for a project
 */
async function getPendingReviews(projectId, limit = 50) {
  try {
    const { data, error } = await supabase.rpc('get_pending_reviews', {
      p_project_id: projectId,
      p_limit: limit,
    });

    if (error) {
      logger.error('Get pending reviews failed', { projectId, error: error.message });
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('Get pending reviews exception', { projectId, error: error.message });
    return [];
  }
}

/**
 * Get a specific review item
 */
async function getReviewItem(reviewId) {
  try {
    const { data, error } = await supabase
      .from('review_queue')
      .select('*')
      .eq('id', reviewId)
      .single();

    if (error) {
      logger.error('Get review item failed', { reviewId, error: error.message });
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Get review item exception', { reviewId, error: error.message });
    return null;
  }
}

/**
 * Approve a finding and add it to project
 */
async function approveFinding(reviewId, userId) {
  try {
    // Get review item
    const reviewItem = await getReviewItem(reviewId);
    if (!reviewItem) {
      throw new Error('Review item not found');
    }

    if (reviewItem.approved !== null) {
      throw new Error('Review item already reviewed');
    }

    // Mark as reviewed
    await supabase
      .from('review_queue')
      .update({
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
        approved: true,
      })
      .eq('id', reviewId);

    // Create item based on finding type
    let itemId = null;

    if (reviewItem.finding_type === 'location') {
      itemId = await createLocationItem(reviewItem, userId);
    } else if (reviewItem.finding_type === 'entity') {
      itemId = await createEntityItem(reviewItem, userId);
    } else if (reviewItem.finding_type === 'organization') {
      itemId = await createOrganizationItem(reviewItem, userId);
    }

    // Update review item with created item ID
    if (itemId) {
      await supabase
        .from('review_queue')
        .update({ item_id: itemId })
        .eq('id', reviewId);
    }

    logger.info('Finding approved', {
      reviewId,
      findingType: reviewItem.finding_type,
      itemId,
    });

    return { reviewItem, itemId };
  } catch (error) {
    logger.error('Approve finding failed', { reviewId, error: error.message });
    throw error;
  }
}

/**
 * Reject a finding
 */
async function rejectFinding(reviewId, userId) {
  try {
    await supabase
      .from('review_queue')
      .update({
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
        approved: false,
      })
      .eq('id', reviewId);

    logger.info('Finding rejected', { reviewId });
    return true;
  } catch (error) {
    logger.error('Reject finding failed', { reviewId, error: error.message });
    throw error;
  }
}

/**
 * Create location item from approved finding
 */
async function createLocationItem(reviewItem, userId) {
  const { project_id, extracted_data } = reviewItem;

  try {
    // Check if location already exists
    const { data: existing } = await supabase
      .from('items')
      .select('id')
      .eq('project_id', project_id)
      .eq('type', 'location')
      .eq('name', extracted_data.name.toLowerCase())
      .maybeSingle();

    if (existing) {
      logger.info('Location already exists', { name: extracted_data.name });
      return existing.id;
    }

    // Geocode if coordinates not provided
    let coordinates = extracted_data.coordinates;
    if (!coordinates && extracted_data.name) {
      const locations = await extractAndGeocode(extracted_data.name);
      if (locations.length > 0 && locations[0].confidence === 'high') {
        coordinates = locations[0].coordinates;
      }
    }

    // Create PostGIS point
    let coordsValue = null;
    if (coordinates && coordinates.latitude && coordinates.longitude) {
      coordsValue = `POINT(${coordinates.longitude} ${coordinates.latitude})`;
    }

    if (!coordsValue) {
      throw new Error('Could not geocode location');
    }

    // Create item
    const { data: item, error } = await supabase
      .from('items')
      .insert({
        project_id,
        name: extracted_data.name.toLowerCase(),
        type: 'location',
        coords: coordsValue,
        data: {
          address: extracted_data.address || extracted_data.name,
          source: reviewItem.source_url,
          discovered_via: 'osint',
        },
        added_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('Location item created', { itemId: item.id, name: extracted_data.name });
    return item.id;
  } catch (error) {
    logger.error('Create location item failed', { error: error.message });
    throw error;
  }
}

/**
 * Create entity item from approved finding
 */
async function createEntityItem(reviewItem, userId) {
  const { project_id, extracted_data } = reviewItem;

  try {
    // Check if entity already exists
    const { data: existing } = await supabase
      .from('items')
      .select('id')
      .eq('project_id', project_id)
      .eq('type', 'entity')
      .eq('name', extracted_data.name.toLowerCase())
      .maybeSingle();

    if (existing) {
      logger.info('Entity already exists', { name: extracted_data.name });
      return existing.id;
    }

    // Create item
    const { data: item, error } = await supabase
      .from('items')
      .insert({
        project_id,
        name: extracted_data.name.toLowerCase(),
        type: 'entity',
        data: {
          source: reviewItem.source_url,
          discovered_via: 'osint',
        },
        added_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('Entity item created', { itemId: item.id, name: extracted_data.name });
    return item.id;
  } catch (error) {
    logger.error('Create entity item failed', { error: error.message });
    throw error;
  }
}

/**
 * Create organization item from approved finding
 */
async function createOrganizationItem(reviewItem, userId) {
  const { project_id, extracted_data } = reviewItem;

  try {
    // Check if organization already exists
    const { data: existing } = await supabase
      .from('items')
      .select('id')
      .eq('project_id', project_id)
      .eq('type', 'organization')
      .eq('name', extracted_data.name.toLowerCase())
      .maybeSingle();

    if (existing) {
      logger.info('Organization already exists', { name: extracted_data.name });
      return existing.id;
    }

    // Create item
    const { data: item, error } = await supabase
      .from('items')
      .insert({
        project_id,
        name: extracted_data.name.toLowerCase(),
        type: 'organization',
        data: {
          source: reviewItem.source_url,
          discovered_via: 'osint',
        },
        added_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('Organization item created', { itemId: item.id, name: extracted_data.name });
    return item.id;
  } catch (error) {
    logger.error('Create organization item failed', { error: error.message });
    throw error;
  }
}

module.exports = {
  getPendingReviews,
  getReviewItem,
  approveFinding,
  rejectFinding,
};

