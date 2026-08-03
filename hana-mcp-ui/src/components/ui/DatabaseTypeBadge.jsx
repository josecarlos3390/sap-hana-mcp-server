import { getDatabaseTypeColor, getDatabaseTypeShortName } from '../../utils/databaseTypes'

const DatabaseTypeBadge = ({ 
  type, 
  size = 'md', 
  showIcon = true,
  className = '' 
}) => {
  const color = getDatabaseTypeColor(type)
  const shortName = getDatabaseTypeShortName(type)
  
  const sizeClasses = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-2.5 py-1 text-sm',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  }
  
  const colorClasses = {
    blue: 'bg-gradient-to-r from-blue-100 to-blue-50 text-blue-800 border-blue-200 shadow-sm',
    amber: 'bg-gradient-to-r from-amber-100 to-amber-50 text-amber-800 border-amber-200 shadow-sm',
    green: 'bg-gradient-to-r from-green-100 to-green-50 text-green-800 border-green-200 shadow-sm',
    gray: 'bg-gradient-to-r from-gray-100 to-gray-50 text-gray-800 border-gray-200 shadow-sm'
  }
  
  const iconClasses = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  }
  
  const getIcon = () => {
    switch (type) {
      case 'single_container':
        return (
          <svg className={iconClasses[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        )
      case 'mdc_system':
        return (
          <svg className={iconClasses[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        )
      case 'mdc_tenant':
        return (
          <svg className={iconClasses[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        )
      default:
        return (
          <svg className={iconClasses[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }
  
  return (
    <span 
      className={`
        inline-flex items-center gap-1.5 font-semibold rounded-full border transition-all duration-200
        hover:shadow-md hover:scale-105
        ${sizeClasses[size]}
        ${colorClasses[color]}
        ${className}
      `}
      title={shortName}
    >
      {showIcon && getIcon()}
      <span className='tracking-wide'>{shortName}</span>
    </span>
  )
}

export default DatabaseTypeBadge
