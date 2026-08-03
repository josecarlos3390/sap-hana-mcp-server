/**
 * Database type detection and display utilities for HANA MCP UI
 */

export const DATABASE_TYPES = {
  SINGLE_CONTAINER: 'single_container',
  MDC_SYSTEM: 'mdc_system', 
  MDC_TENANT: 'mdc_tenant'
}

/**
 * Detect database type based on configuration data
 * @param {Object} data - Configuration data
 * @returns {string} Database type
 */
export const detectDatabaseType = (data) => {
  if (!data) return DATABASE_TYPES.SINGLE_CONTAINER
  
  if (data.HANA_INSTANCE_NUMBER && data.HANA_DATABASE_NAME) {
    return DATABASE_TYPES.MDC_TENANT
  } else if (data.HANA_INSTANCE_NUMBER && !data.HANA_DATABASE_NAME) {
    return DATABASE_TYPES.MDC_SYSTEM
  } else {
    return DATABASE_TYPES.SINGLE_CONTAINER
  }
}

/**
 * Get display name for database type
 * @param {string} type - Database type
 * @returns {string} Display name
 */
export const getDatabaseTypeDisplayName = (type) => {
  const displayNames = {
    [DATABASE_TYPES.SINGLE_CONTAINER]: 'Single-Container Database',
    [DATABASE_TYPES.MDC_SYSTEM]: 'MDC System Database',
    [DATABASE_TYPES.MDC_TENANT]: 'MDC Tenant Database'
  }
  return displayNames[type] || 'Unknown Database Type'
}

/**
 * Get short display name for database type
 * @param {string} type - Database type
 * @returns {string} Short display name
 */
export const getDatabaseTypeShortName = (type) => {
  const shortNames = {
    [DATABASE_TYPES.SINGLE_CONTAINER]: 'Single-Container',
    [DATABASE_TYPES.MDC_SYSTEM]: 'MDC System',
    [DATABASE_TYPES.MDC_TENANT]: 'MDC Tenant'
  }
  return shortNames[type] || 'Unknown'
}

/**
 * Get color for database type badge
 * @param {string} type - Database type
 * @returns {string} Color class
 */
export const getDatabaseTypeColor = (type) => {
  const colors = {
    [DATABASE_TYPES.SINGLE_CONTAINER]: 'blue',
    [DATABASE_TYPES.MDC_SYSTEM]: 'amber', 
    [DATABASE_TYPES.MDC_TENANT]: 'green'
  }
  return colors[type] || 'gray'
}

/**
 * Check if MDC fields should be shown
 * @param {string} detectedType - Auto-detected type
 * @param {string} manualType - Manually selected type
 * @returns {boolean} Should show MDC fields
 */
export const shouldShowMDCFields = (detectedType, manualType) => {
  // Show MDC fields only for MDC system or tenant types
  return manualType === DATABASE_TYPES.MDC_SYSTEM || 
         manualType === DATABASE_TYPES.MDC_TENANT
}

/**
 * Get required fields for database type
 * @param {string} type - Database type
 * @returns {Array} Required field names
 */
export const getRequiredFieldsForType = (type) => {
  const baseFields = ['HANA_HOST', 'HANA_USER', 'HANA_PASSWORD']
  
  switch (type) {
    case DATABASE_TYPES.MDC_TENANT:
      return [...baseFields, 'HANA_INSTANCE_NUMBER', 'HANA_DATABASE_NAME']
    case DATABASE_TYPES.MDC_SYSTEM:
      return [...baseFields, 'HANA_INSTANCE_NUMBER']
    case DATABASE_TYPES.SINGLE_CONTAINER:
    default:
      return baseFields
  }
}

/**
 * Get recommended fields for database type
 * @param {string} type - Database type
 * @returns {Array} Recommended field names
 */
export const getRecommendedFieldsForType = (type) => {
  switch (type) {
    case DATABASE_TYPES.SINGLE_CONTAINER:
      return ['HANA_SCHEMA']
    default:
      return []
  }
}

/**
 * Validate configuration for specific database type
 * @param {Object} data - Configuration data
 * @param {string} type - Database type
 * @returns {Object} Validation result
 */
export const validateForDatabaseType = (data, type) => {
  const errors = {}
  const requiredFields = getRequiredFieldsForType(type)
  const recommendedFields = getRecommendedFieldsForType(type)
  
  // Check required fields
  requiredFields.forEach(field => {
    if (!data[field] || data[field].toString().trim() === '') {
      errors[field] = `${field.replace('HANA_', '')} is required for ${getDatabaseTypeShortName(type)}`
    }
  })
  
  // Check recommended fields
  recommendedFields.forEach(field => {
    if (!data[field] || data[field].toString().trim() === '') {
      errors[field] = `${field.replace('HANA_', '')} is recommended for ${getDatabaseTypeShortName(type)}`
    }
  })
  
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    databaseType: type
  }
}
