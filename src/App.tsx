import React, { useState, useEffect, useRef } from 'react';
import { Terminal, GitBranch, Globe } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface OutputMessage {
  id: number;
  text: string;
  type: 'stdout' | 'stderr' | 'system' | 'success' | 'error';
  isProgress?: boolean;
  replaceLast?: boolean;
}

interface SocketMessage {
  commandId: string;
  output?: string;
  outputType?: string;
  exitCode?: number;
  isProgress?: boolean;
  replaceLast?: boolean;
}

interface ApiResponse {
  success: boolean;
  commandId?: string;
  error?: string;
  repos?: string[];
}

const CommandRunner: React.FC = () => {
  const [gitUrl, setGitUrl] = useState<string>('');
  const [branch, setBranch] = useState<string>('main');
  const [output, setOutput] = useState<OutputMessage[]>([]);
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null);
  const [deployedRepos, setDeployedRepos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket>(null);

  // Custom findLastIndex implementation
  const findLastIndex = <T,>(array: T[], predicate: (value: T) => boolean): number => {
    for (let i = array.length - 1; i >= 0; i--) {
      if (predicate(array[i])) {
        return i;
      }
    }
    return -1;
  };

  useEffect(() => {
    // Initialize Socket.IO connection
    socketRef.current = io('http://localhost:5001', {
      withCredentials: true
    });

    // Socket.IO event listeners
    socketRef.current.on('connect', () => {
      console.log('Connected to Socket.IO server');
      setIsConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from Socket.IO server');
      setIsConnected(false);
    });

    socketRef.current.on('commandOutput', (data: SocketMessage) => {
      if (data.output) {
        setOutput(prev => {
          const newOutput = [...prev];
          const outputMessage: OutputMessage = {
            id: Date.now(),
            text: data.output || '',
            type: (data.outputType as OutputMessage['type']) || 'stdout',
            isProgress: data.isProgress,
            replaceLast: data.replaceLast
          };

          // Handle progress updates
          if (data.isProgress && data.replaceLast) {
            const lastProgressIndex = findLastIndex(newOutput, msg => msg.isProgress);
            if (lastProgressIndex !== -1) {
              newOutput[lastProgressIndex] = outputMessage;
              return newOutput;
            }
          }

          return [...newOutput, outputMessage];
        });
      }
    });

    socketRef.current.on('commandFinished', (data: SocketMessage) => {
      if (typeof data.exitCode === 'number') {
        setOutput(prev => [...prev, {
          id: Date.now(),
          text: `Process finished with exit code: ${data.exitCode}`,
          type: data.exitCode === 0 ? 'success' : 'error'
        }]);
        setActiveCommandId(null);
        setIsLoading(false);
        fetchDeployedRepos();
      }
    });

    // Initial repo fetch
    fetchDeployedRepos();

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const fetchDeployedRepos = async (): Promise<void> => {
    try {
      const response = await fetch('http://localhost:5001/api/repos', {
        credentials: 'include'
      });
      const data: ApiResponse = await response.json();
      if (data.repos) {
        setDeployedRepos(data.repos);
      }
    } catch (error) {
      console.error('Failed to fetch repos:', error);
    }
  };

  const deployRepo = async (): Promise<void> => {
    if (!gitUrl.trim()) return;

    setOutput([]);
    setIsLoading(true);
    
    try {
      const response = await fetch('http://localhost:5001/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          gitUrl: gitUrl.trim(),
          branch: branch.trim()
        }),
      });

      const data: ApiResponse = await response.json();
      
      if (data.success && data.commandId) {
        setActiveCommandId(data.commandId);
      } else {
        setOutput(prev => [...prev, {
          id: Date.now(),
          text: `Error: ${data.error || 'Unknown error'}`,
          type: 'error'
        }]);
        setIsLoading(false);
      }
    } catch (error) {
      setOutput(prev => [...prev, {
        id: Date.now(),
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      }]);
      setIsLoading(false);
    }
  };

  const stopProcess = async (): Promise<void> => {
    if (!activeCommandId) return;

    try {
      const response = await fetch('http://localhost:5001/api/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          commandId: activeCommandId
        }),
      });

      const data: ApiResponse = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to stop process');
      }
    } catch (error) {
      console.error('Failed to stop process:', error);
    }
  };

  const getOutputClassName = (type: OutputMessage['type']): string => {
    switch (type) {
      case 'stderr':
      case 'error':
        return 'text-red-400';
      case 'success':
        return 'text-green-400';
      case 'system':
        return 'text-blue-400';
      default:
        return 'text-green-400';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Terminal className="w-6 h-6" />
          <h1 className="text-2xl font-bold">React App Deployer</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-600">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5" />
          <input
            type="text"
            value={gitUrl}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGitUrl(e.target.value)}
            placeholder="Git repository URL"
            className="flex-1 p-2 border rounded"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          <input
            type="text"
            value={branch}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBranch(e.target.value)}
            placeholder="Branch name"
            className="flex-1 p-2 border rounded"
          />
        </div>

        <button
          onClick={activeCommandId ? stopProcess : deployRepo}
          disabled={isLoading && !activeCommandId}
          className={`w-full p-2 rounded text-white ${
            isLoading 
              ? 'bg-gray-400'
              : activeCommandId
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-green-500 hover:bg-green-600'
          }`}
        >
          {isLoading 
            ? 'Deploying...' 
            : activeCommandId 
              ? 'Stop Deployment' 
              : 'Start Deployment'}
        </button>
      </div>

      {deployedRepos.length > 0 && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Deployed Repositories:</h2>
          <div className="bg-gray-100 p-2 rounded">
            {deployedRepos.map(repo => (
              <div key={repo} className="text-sm text-gray-600">{repo}</div>
            ))}
          </div>
        </div>
      )}

      <div
        ref={outputRef}
        className="bg-gray-900 text-white p-4 rounded h-[500px] overflow-y-auto font-mono whitespace-pre-wrap"
      >
        {output.map(({ id, text, type }) => (
          <div
            key={id}
            className={getOutputClassName(type)}
          >
            {text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommandRunner;