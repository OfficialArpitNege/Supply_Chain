import React from 'react';
import { Link } from 'react-router-dom';

const PlaceholderPage = ({ title }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-700">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-slate-400 mt-1">Manage your {title.toLowerCase()} and system intelligence.</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Metrics Overview</h3>
          <div className="h-32 bg-slate-900/50 rounded-lg border border-slate-700/50 flex items-center justify-center italic text-slate-500">
            Chart Placeholder
          </div>
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Recent Activities</h3>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 text-sm border-b border-slate-700/30 pb-2 last:border-0">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>
                <div>
                  <p className="text-slate-200">System update processed successfully</p>
                  <p className="text-slate-500 text-xs">2 hours ago</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 text-blue-400">AI Intelligence</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Module {title} is currently synchronized with the neural network. 
            Risk analysis: <span className="text-green-400 font-mono">STABLE</span>
          </p>
          <button className="btn-primary w-full mt-6">View Analytics</button>
        </div>
      </div>
      
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Detailed View - {title}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Timeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {[1, 2, 3, 4, 5].map(i => (
                <tr key={i} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-4 font-mono text-blue-400 text-sm">#TXN-9{i}22</td>
                  <td className="px-4 py-4">
                    <span className="badge bg-green-500/10 text-green-400">ACTIVE</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="badge badge-low">LOW</span>
                  </td>
                  <td className="px-4 py-4 text-slate-400 text-sm">Apr 21, 2026</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const Logistics = () => <PlaceholderPage title="Logistics" />;
export const Inventory = () => <PlaceholderPage title="Inventory" />;
export const Suppliers = () => <PlaceholderPage title="Suppliers" />;
export const Users = () => <PlaceholderPage title="Users" />;
export const Automation = () => <PlaceholderPage title="Automation" />;
export const AIInsights = () => <PlaceholderPage title="AI Insights" />;

export const NotFound = () => (
  <div className="flex flex-col items-center justify-center h-[70vh] text-center">
    <h1 className="text-9xl font-bold text-slate-700">404</h1>
    <h2 className="text-3xl font-bold mt-4">Page Not Found</h2>
    <p className="text-slate-400 mt-2 max-w-md">
      The intelligence module you are looking for has been moved or does not exist in this sector.
    </p>
    <Link to="/dashboard" className="btn-primary mt-8">Back to Dashboard</Link>
  </div>
);
