import CollectionsPanel from '@/components/collections-panel';
import RequestPanel from '@/components/request-panel';

function Collections() {
  return (
    <div className="w-full">
      <div className="flex flex-auto">
        <div className="w-1/3 justify-start">
          <CollectionsPanel />
        </div>
        <div className="w-2/3">
          <RequestPanel />
        </div>
      </div>
    </div>
  );
}

export default Collections;
