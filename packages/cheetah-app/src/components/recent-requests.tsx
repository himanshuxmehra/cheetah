import { loadFromLocalStorage } from '@/utils/saveToLocalStorage';
import { useEffect, useState } from 'react';

function RecentRequests() {
  const [recentRequests, setRecentRequests] = useState<Object[] | null>([]);

  useEffect(() => {
    let loadedData: Object[] | null = loadFromLocalStorage('recentRequest');
    console.log(loadedData);
    setRecentRequests(loadedData);
    console.log(recentRequests);
  }, []);

  return (
    <div className="w-full p-4 rounded-lg shadow-lg overflow-auto">
      <h2 className="text-2xl font-bold mb-4">Saved Requests</h2>
      <div className="space-y-4">
        {recentRequests?.map((req:any, index: number) => (
          <div key={index} className="p-4 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold">Request {index + 1}</h3>
            <p className="">
              {req.type} {req.url}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RecentRequests;
