/**
 * Benchmark Results Display
 * Shows spatial reasoning task results in a table format with accuracy metrics
 */

import React from 'react';
import { BenchmarkResult, SpatialResult } from '../types';

interface BenchmarkResultsProps {
  results: BenchmarkResult[];
}

export default function BenchmarkResults({ results }: BenchmarkResultsProps) {
  if (results.length === 0) {
    return (
      <div className="text-slate-400 text-sm italic">
        No results yet
      </div>
    );
  }

  // Compute aggregate metrics
  const modelIds = new Set<string>();
  results.forEach(r => r.model_results.forEach(m => modelIds.add(m.model_id)));
  const uniqueModels = Array.from(modelIds);

  const avgAccuracyByModel: Record<string, number> = {};
  uniqueModels.forEach(model => {
    const accuracies = results
      .flatMap(r => r.model_results.filter(m => m.model_id === model))
      .map(m => m.accuracy);
    avgAccuracyByModel[model] = accuracies.length > 0
      ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
      : 0;
  });

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-4">
        <h3 className="text-xs font-bold text-slate-100 mb-3 uppercase tracking-wider">📊 Model Accuracy</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {uniqueModels.map(model => (
            <div key={model} className="bg-slate-900/40 rounded p-2">
              <div className="text-xs text-slate-400 font-mono truncate">{model}</div>
              <div className="text-lg font-bold text-green-400">
                {(avgAccuracyByModel[model] * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Task-by-task results */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-4 overflow-x-auto">
        <h3 className="text-xs font-bold text-slate-100 mb-3 uppercase tracking-wider">📋 Task Results</h3>
        <table className="w-full text-xs text-slate-300">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left py-2 px-2 font-mono">Task</th>
              <th className="text-left py-2 px-2 font-mono">Category</th>
              {uniqueModels.map(model => (
                <th key={model} className="text-left py-2 px-2 font-mono whitespace-nowrap">{model}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((task, idx) => (
              <tr key={idx} className="border-b border-slate-700/30 hover:bg-slate-800/20">
                <td className="py-2 px-2 font-mono text-slate-400">{task.task_id}</td>
                <td className="py-2 px-2 text-slate-400 capitalize">{task.category}</td>
                {uniqueModels.map(model => {
                  const modelResult = task.model_results.find(r => r.model_id === model);
                  if (!modelResult) {
                    return <td key={model} className="py-2 px-2 text-slate-500">—</td>;
                  }

                  const accuracy = modelResult.accuracy;
                  let color = 'text-red-400';
                  if (accuracy > 0.7) color = 'text-green-400';
                  else if (accuracy > 0.4) color = 'text-yellow-400';

                  return (
                    <td key={model} className={`py-2 px-2 font-mono ${color}`}>
                      {(accuracy * 100).toFixed(0)}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reasoning depth distribution */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-4">
        <h3 className="text-xs font-bold text-slate-100 mb-3 uppercase tracking-wider">🧠 Reasoning Depth</h3>
        <div className="space-y-2">
          {uniqueModels.map(model => {
            const depths = results
              .flatMap(r => r.model_results.filter(m => m.model_id === model))
              .map(m => m.reasoning_depth);

            const depthCounts = {
              shallow: depths.filter(d => d === 'shallow').length,
              adequate: depths.filter(d => d === 'adequate').length,
              deep: depths.filter(d => d === 'deep').length,
            };

            return (
              <div key={model} className="text-xs">
                <div className="font-mono text-slate-400 mb-1">{model}</div>
                <div className="flex gap-2 text-slate-300">
                  <span>Shallow: {depthCounts.shallow}</span>
                  <span>Adequate: {depthCounts.adequate}</span>
                  <span>Deep: {depthCounts.deep}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
