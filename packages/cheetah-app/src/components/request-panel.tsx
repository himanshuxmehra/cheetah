import { useState, ChangeEvent, FormEvent, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CopyToClipboardButton from './ui/copy-to-clipboard';
import { SaveIcon } from './icons/save-button';
import { saveRecentRequest, saveToCollection } from '@/utils/saveRequest';
import { loadFromLocalStorage } from '@/utils/saveToLocalStorage';

interface Header {
  key: string;
  value: string;
}

interface RequestData {
  type: string;
  url: string;
  body: string;
  headers: Header[];
}

interface Request {
  status: number;
  url: string;
  body: string;
  headers: Object;
}

interface CollectionData {
  id: number;
  name: string;
  description: string;
  editable: boolean;
  requests: RequestData[];
}

function RequestPanel() {
  const [requestData, setRequestData] = useState<RequestData>({
    type: 'GET',
    url: '',
    body: '',
    headers: [{ key: '', value: '' }]
  });
  const [responseData, setResponseData] = useState<Request>({
    status: -1,
    url: '',
    body: '',
    headers: {}
  });
  const [savedCollections, setSavedCollections] = useState<CollectionData[]>();
  const [savedToCollection, setSaveToCollection] = useState<{ id: number }>({
    id: -1
  });

  useEffect(() => {
    let loadedData: CollectionData[] | null = loadFromLocalStorage('savedCollections');
    console.log(loadedData);
    loadedData ? setSavedCollections(loadedData) : setSavedCollections([]);
    console.log(savedCollections);
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRequestData({ ...requestData, [name]: value });
  };

  const handleHeaderChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>, index: number) => {
    const { name, value } = e.target;
    const updatedHeaders = [...requestData.headers];
    if (name === 'Key') {
      updatedHeaders[index].key = value;
    } else {
      updatedHeaders[index].value = value;
    }
    setRequestData({ ...requestData, headers: updatedHeaders });
  };

  const addHeader = () => {
    setRequestData({
      ...requestData,
      headers: [...requestData.headers, { key: '', value: '' }]
    });
  };

  const removeHeader = (index: number) => {
    const updatedHeaders = [...requestData.headers];
    updatedHeaders.splice(index, 1);
    setRequestData({ ...requestData, headers: updatedHeaders });
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    saveToCollection(requestData, savedToCollection.id);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const { type, url, body, headers } = requestData;

    try {
      // Construct headers dynamically based on user input
      const constructedHeaders = headers.reduce((acc, header) => {
        if (header.key && header.value) {
          acc[header.key] = header.value;
        }
        return acc;
      }, {} as Record<string, string>);

      const requestOptions: RequestInit = {
        method: type,
        headers: {
          'Content-Type': 'application/json',
          ...constructedHeaders
        },
        body: type === 'GET' ? undefined : body
      };
      console.log(requestOptions);

      const response = await fetch(url, requestOptions);
      const data = await response.json();
      // Handle the response data, e.g., update state or show a message
      console.log('API Response:', response);
      setResponseData({
        status: response.status,
        body: JSON.stringify(data, null, 2),
        headers: response.headers,
        url: response.url
      });
      saveRecentRequest(requestData);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  function findCollectionById(id: number): string | null {
    const foundCollection = savedCollections?.find((collection) => collection.id === id);
    return foundCollection ? foundCollection.name : null;
  }

  return (
    <div className="w-full flex flex-col gap-4 px-8 rounded-lg shadow-lg">
      <div className="space-y-4  p-4 rounded-lg shadow-md">
        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">{requestData.type} </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>METHOD</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={requestData.type}
                onValueChange={(value) => setRequestData({ ...requestData, type: value })}
              >
                <DropdownMenuRadioItem value="GET">GET</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="POST">POST</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="PUT">PUT</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="DELETE">DELETE</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <input
            className="flex h-10 w-full border border-input px-3 py-2 text-sm text-black ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex-1 rounded-lg"
            placeholder="Enter URL"
            id="url"
            name="url"
            value={requestData.url}
            onChange={(e) => handleChange(e)}
          />
          <button
            className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-primary/90 h-10 px-4 py-2 bg-green-500 rounded-lg"
            onClick={handleSubmit}
          >
            Send
          </button>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="flex items-center space-0" variant="outline">
                <SaveIcon className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Save Request</DialogTitle>
                <DialogDescription>Click save when you're done.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Name
                  </Label>
                  <Input id="name" defaultValue="" placeholder="Request Name" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Collection
                  </Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="col-span-3" variant="outline">
                        {findCollectionById(savedToCollection.id)
                          ? findCollectionById(savedToCollection.id)
                          : "--"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-72">
                      <DropdownMenuLabel>Collection</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioGroup
                        value={savedToCollection.id.toString()}
                        onValueChange={(value) => {
                          setSaveToCollection({ id: parseInt(value) });
                        }}
                      >
                        {savedCollections?.map((collection, index) => (
                          <DropdownMenuRadioItem key={index} value={collection.id.toString()}>
                            {collection.name}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" onClick={handleSave}>
                  Save changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="grid gap-4">
          <div className="space-y-2">
            <h3 className="text-sm text-left font-semibold ">Headers</h3>
            <div className="grid gap-2 text-black" id="reqHeaders">
              {requestData.headers.map((header, index) => (
                <div key={index} className="grid grid-cols-6 gap-2">
                  <input
                    className="h-10 w-full border border-input px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg"
                    placeholder="Key"
                    name="Key"
                    value={header.key}
                    onChange={(e) => handleHeaderChange(e, index)}
                    id="headersKey1"
                  />
                  <input
                    className="h-10 col-span-4 w-full border border-input px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg"
                    placeholder="Value"
                    name="Value"
                    value={header.value}
                    onChange={(e) => handleHeaderChange(e, index)}
                    id="headersValue1"
                  />
                  <button
                    className="h-10 w-full border border-input px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg"
                    type="button"
                    onClick={() => removeHeader(index)}
                  >
                    X
                  </button>
                </div>
              ))}
              <button
                // onClick="addHeader()"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 border-green-500 text-green-500"
                onClick={addHeader}
              >
                Add Header
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm text-left font-semibold ">Body</h3>
            <input
              height={100}
              id="body"
              name="body"
              className="flex w-full border border-input px-3 py-1 text-black text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px] rounded-lg"
              placeholder="Enter request body"
              value={requestData.body}
              onChange={(e) => handleChange(e)}
            />
          </div>
        </div>
      </div>
      <div className="space-y-1 px-4 rounded-lg shadow-md">
        <h2 className="text-lg text-left font-bold ">Response</h2>
        <div className="gap-4">
          <div className="mb-0" id="tabs">
            <Tabs defaultValue="body" className="text-left pt-2">
              <TabsList>
                <div className="mr-1 inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-background text-foreground shadow-sm">
                  Status: {responseData.status === -1 ? '---' : responseData.status}
                </div>
                <div className="mr-1">|</div>
                <TabsTrigger value="body">Body</TabsTrigger>
                <TabsTrigger value="headers">Headers</TabsTrigger>
              </TabsList>
              <TabsContent value="body" className="pt-1">
                <div id="content-tab1" className="tab-content">
                  <h3 className="text-lg font-semibold">Body</h3>
                  <div className="flex space-y-1 relative">
                    <div
                      className="flex h-64 w-full overflow-y-scroll overflow-x-clip max-w-full text-left border border-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[200px] rounded-lg"
                      id="responseOutput"
                    >
                      <pre className="whitespace-pre-wrap break-words">{responseData.body}</pre>
                    </div>
                    <div className="absolute right-0 text-white">
                      <CopyToClipboardButton textToCopy={responseData.body} />
                    </div>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="headers" className="pt-1">
                <div id="content-tab2" className="tab-content">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold ">Headers</h3>
                    <div
                      className="flex h-64 w-full overflow-y-scroll overflow-x-clip max-w-full text-left border border-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[200px] rounded-lg"
                      id="responseOutput"
                    >
                      <pre className="whitespace-pre-wrap break-words">{/* TBD */}TBD</pre>
                    </div>
                    <div className="absolute right-0 text-white">
                      <CopyToClipboardButton textToCopy={JSON.stringify(responseData.headers)} />
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RequestPanel;
