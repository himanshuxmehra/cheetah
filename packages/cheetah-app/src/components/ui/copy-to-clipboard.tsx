import React from 'react';
import { Button } from '@/components/ui/button';
import { PaperclipIcon } from '../icons/paper-clip-icon';

interface CopyToClipboardButtonProps {
  textToCopy: string;
}

const CopyToClipboardButton: React.FC<CopyToClipboardButtonProps> = ({ textToCopy }) => {
  const handleCopyClick = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch (error) {
      console.error('Unable to copy to clipboard', error);
    }
  };

  return (
    <div>
      <Button
        className="transition-transform duration-200 hover:scale-105"
        variant="outline"
        onClick={handleCopyClick}
      >
        <PaperclipIcon className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default CopyToClipboardButton;
