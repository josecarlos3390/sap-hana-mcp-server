import { useState } from 'react';
import { motion } from 'framer-motion';
import { GradientButton, EnvironmentBadge, DatabaseTypeBadge } from './ui';
import { cn } from '../utils/cn';
import { detectDatabaseType, getDatabaseTypeDisplayName } from '../utils/databaseTypes';

const EnhancedServerCard = ({
  name,
  server,
  index,
  activeEnvironment,
  isSelected = false,
  onSelect,
  onEdit,
  onAddToClaude,
  onDelete
}) => {
  const environmentCount = Object.keys(server.environments || {}).length;
  const hasActiveConnection = !!activeEnvironment;
  
  // Real connection status
  const connectionStatus = hasActiveConnection ? 'active' : 'configured';
  const lastModified = server.modified ? new Date(server.modified).toLocaleDateString() : 'Unknown';

  // Count environments connected to Claude
  const claudeActiveCount = hasActiveConnection ? 1 : 0;
  
  // Detect database type from active environment
  const activeEnvData = activeEnvironment ? server.environments[activeEnvironment] : {};
  const databaseType = detectDatabaseType(activeEnvData);

  const handleRowClick = () => {
    if (onSelect) {
      onSelect(name);
    }
  };

  const handleRadioChange = (e) => {
    e.stopPropagation();
    if (onSelect) {
      onSelect(name);
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'active': return 'text-green-600';
      case 'configured': return 'text-[#86a0ff]';
      case 'error': return 'text-red-600';
      default: return 'text-gray-400';
    }
  };

  return (
    <motion.div
      className={cn(
        "border-b border-gray-200 transition-colors cursor-pointer",
        isSelected 
          ? "bg-blue-50 border-blue-200" 
          : "bg-white hover:bg-gray-50"
      )}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      onClick={handleRowClick}
    >
      <div className="px-6 py-4">
        <div className="grid grid-cols-12 gap-4 items-center">
          {/* Selection Radio */}
          <div className="col-span-1">
            <input
              type="radio"
              name="database-selection"
              checked={isSelected}
              onChange={handleRadioChange}
              className="w-4 h-4 text-[#86a0ff] border-gray-300 focus:ring-[#86a0ff]"
            />
          </div>
          
          {/* Database Info */}
          <div className="col-span-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900 truncate">{name}</h3>
              </div>
            </div>
          </div>
          
          {/* Active Environment */}
          <div className="col-span-2">
            {hasActiveConnection && activeEnvironment ? (
              <EnvironmentBadge environment={activeEnvironment} active size="sm" />
            ) : (
              <span className="text-sm text-gray-500">None</span>
            )}
          </div>
          
          {/* Environment Count */}
          <div className="col-span-2">
            <span className="text-sm font-medium text-gray-600">{environmentCount}</span>
          </div>
          
          {/* Description */}
          <div className="col-span-3">
            {server.description && (
              <span className="text-sm text-gray-500 truncate block">{server.description}</span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );

};

export default EnhancedServerCard;
