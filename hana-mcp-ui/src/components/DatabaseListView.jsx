import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SearchAndFilter from './SearchAndFilter';
import EnhancedServerCard from './EnhancedServerCard';
import { cn } from '../utils/cn';

const DatabaseListView = ({
  hanaServers,
  claudeServers,
  activeEnvironments,
  onEditServer,
  onAddToClaudeServer,
  onDeleteServer,
  onAddDatabase
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDatabase, setSelectedDatabase] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    sortBy: 'name',
    sortOrder: 'asc'
  });

  // Selection handlers
  const handleDatabaseSelect = (databaseName) => {
    setSelectedDatabase(databaseName);
  };

  const handleEditSelected = () => {
    if (selectedDatabase && hanaServers[selectedDatabase]) {
      onEditServer(hanaServers[selectedDatabase]);
    }
  };

  const handleAddToClaudeSelected = () => {
    if (selectedDatabase) {
      onAddToClaudeServer(selectedDatabase);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedDatabase) {
      onDeleteServer(selectedDatabase);
      setSelectedDatabase(null);
    }
  };

  // Calculate filter counts
  const filterCounts = useMemo(() => {
    const servers = Object.entries(hanaServers);
    const activeInClaude = Object.keys(activeEnvironments).length;
    return {
      total: servers.length,
      active: servers.filter(([name]) => claudeServers.some(cs => cs.name === name)).length,
      activeInClaude: activeInClaude,
      production: servers.filter(([, server]) => server.environments?.Production).length,
      development: servers.filter(([, server]) => server.environments?.Development).length,
      staging: servers.filter(([, server]) => server.environments?.Staging).length,
      activeFilter: filters.status
    };
  }, [hanaServers, claudeServers, filters.status, activeEnvironments]);

  // Filter and sort servers
  const filteredServers = useMemo(() => {
    let filtered = Object.entries(hanaServers);

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(([name, server]) =>
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        server.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (filters.status !== 'all') {
      switch (filters.status) {
        case 'active':
          filtered = filtered.filter(([name]) =>
            claudeServers.some(cs => cs.name === name)
          );
          break;
        case 'production':
        case 'development':
        case 'staging':
          filtered = filtered.filter(([, server]) =>
            server.environments?.[filters.status.charAt(0).toUpperCase() + filters.status.slice(1)]
          );
          break;
      }
    }

    // Apply sorting
    filtered.sort(([nameA, serverA], [nameB, serverB]) => {
      let valueA, valueB;

      switch (filters.sortBy) {
        case 'name':
          valueA = nameA.toLowerCase();
          valueB = nameB.toLowerCase();
          break;
        case 'created':
          valueA = new Date(serverA.created || 0);
          valueB = new Date(serverB.created || 0);
          break;
        case 'modified':
          valueA = new Date(serverA.modified || 0);
          valueB = new Date(serverB.modified || 0);
          break;
        case 'environments':
          valueA = Object.keys(serverA.environments || {}).length;
          valueB = Object.keys(serverB.environments || {}).length;
          break;
        default:
          valueA = nameA.toLowerCase();
          valueB = nameB.toLowerCase();
      }

      if (filters.sortOrder === 'desc') {
        [valueA, valueB] = [valueB, valueA];
      }

      if (valueA < valueB) return -1;
      if (valueA > valueB) return 1;
      return 0;
    });

    return filtered;
  }, [hanaServers, claudeServers, searchQuery, filters]);



  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleClearFilters = () => {
    setFilters({
      status: 'all',
      sortBy: 'name',
      sortOrder: 'asc'
    });
    setSearchQuery('');
  };

  return (
    <div className="p-6 space-y-6 bg-gray-100 rounded-2xl sm:rounded-3xl overflow-y-auto max-h-full database-list-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">My Local Databases</h1>
          <p className="text-gray-600">
            Manage your HANA database configurations
          </p>
          {filterCounts.activeInClaude > 0 && (
            <div className="flex items-center space-x-2 mt-2">
              <div className="flex items-center space-x-1 text-green-600 bg-green-50 px-3 py-1 rounded-full">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium">
                  {filterCounts.activeInClaude} environment{filterCounts.activeInClaude !== 1 ? 's' : ''} connected to Claude
                </span>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={onAddDatabase}
          className="flex items-center px-4 py-2 bg-[#86a0ff] text-white text-sm font-medium rounded-lg hover:bg-[#7990e6] transition-colors shadow-sm hover:shadow-md"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Database
        </button>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <SearchAndFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filters={filters}
          onFiltersChange={setFilters}
          filterCounts={filterCounts}
        />
      </div>

      {/* Top Bar with Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">
              {filteredServers.length} of {Object.keys(hanaServers).length} databases
            </span>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleEditSelected}
              disabled={!selectedDatabase}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Edit
            </button>
            
            <button
              onClick={handleAddToClaudeSelected}
              disabled={!selectedDatabase}
              className="px-4 py-2 text-sm font-medium text-white bg-[#86a0ff] border border-[#86a0ff] rounded-lg hover:bg-[#7990e6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add to Claude
            </button>
            
            <button
              onClick={handleDeleteSelected}
              disabled={!selectedDatabase}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Database Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredServers.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No databases found</h3>
            <p className="text-gray-600 mb-4">
              {searchQuery ? `No databases match "${searchQuery}"` : 'Get started by adding your first database'}
            </p>
            <button
              onClick={onAddDatabase}
              className="inline-flex items-center px-6 py-3 bg-[#86a0ff] text-white font-medium rounded-lg hover:bg-[#7990e6] transition-colors shadow-sm hover:shadow-md"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Your First Database
            </button>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
              <div className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-1">
                  {/* Empty header for radio button column */}
                </div>
                <div className="col-span-4">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Database</h3>
                </div>
                <div className="col-span-2">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Active Environment</h3>
                </div>
                <div className="col-span-2">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Environments</h3>
                </div>
                <div className="col-span-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Description</h3>
                </div>
              </div>
            </div>

            {/* Database List */}
            <div className="divide-y divide-gray-200">
              <AnimatePresence>
                {filteredServers.map(([name, server], index) => (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                  >
                    <EnhancedServerCard
                      name={name}
                      server={server}
                      index={index}
                      isSelected={selectedDatabase === name}
                      activeEnvironment={activeEnvironments[name]}
                      onSelect={handleDatabaseSelect}
                      onEdit={() => onEditServer(server)}
                      onAddToClaude={() => onAddToClaudeServer(name)}
                      onDelete={() => onDeleteServer(name)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DatabaseListView;
