import RecentRequests from '@/components/recent-requests';
import RequestPanel from '@/components/request-panel';

function RecentPage() {
  return (
    <div className='w-full'>
      <div className="flex flex-auto">
        <div className='w-1/3 justify-start'>
          <RecentRequests />
        </div>
        <div className='w-2/3'>
          <RequestPanel />
        </div>
      </div>
    </div>
  );
}

export default RecentPage;
