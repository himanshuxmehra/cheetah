import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import CollectionRequest from './collection-requests';
import { ChangeEvent, useEffect, useState } from 'react';
import { loadFromLocalStorage, saveToLocalStorage } from '@/utils/saveToLocalStorage';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';

interface Header {
  key: string;
  value: string;
}

interface RequestData {
  name: string;
  type: string;
  url: string;
  body: string;
  headers: Header[];
}

interface CollectionData {
  id: number;
  name: string;
  description: string;
  editable: boolean;
  requests: RequestData[];
}

interface SavedCollections {}

const CollectionsPanel: React.FC<SavedCollections> = () => {
  const [savedCollections, setSavedCollections] = useState<CollectionData[]>();
  const [newCollection, setNewCollection] = useState<CollectionData>({
    id: -1,
    name: '',
    description: '',
    editable: true,
    requests: []
  });

  useEffect(() => {
    let loadedData: CollectionData[] | null = loadFromLocalStorage('savedCollections');
    console.log(loadedData);
    loadedData ? setSavedCollections(loadedData) : setSavedCollections([]);
    console.log(savedCollections);
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewCollection({ ...newCollection, [name]: value });
  };

  const handleSubmit = async () => {
    try {
      let loadedData: CollectionData[] | null = loadFromLocalStorage('savedCollections');
      let totalCollections: number = loadedData ? loadedData?.length : 0;
      newCollection.id = totalCollections + 1;
      setNewCollection({
        ...newCollection,
      });
      loadedData
        ? saveToLocalStorage('savedCollections', [...loadedData, newCollection])
        : saveToLocalStorage('savedCollections', [newCollection]);
      loadedData = loadFromLocalStorage('savedCollections');
      loadedData ? setSavedCollections(loadedData) : setSavedCollections([]);
      setNewCollection({
        id: -1,
        name: '',
        description: '',
        editable: true,
        requests: []
      });
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div>
      <Sheet>
        <SheetTrigger>
          <button className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-primary/90 h-10 px-4 py-2 bg-green-500 rounded-lg">
            Create Collection
          </button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Create Collection</SheetTitle>
            <SheetDescription>
              Make changes to your collection here. Click save when you're done.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                name="name"
                value={newCollection.name}
                onChange={handleChange}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="username" className="text-right">
                Description
              </Label>
              <Input
                id="description"
                name="description"
                value={newCollection.description}
                onChange={handleChange}
                className="col-span-3"
              />
            </div>
          </div>

          <SheetFooter>
            <SheetClose asChild>
              <Button type="submit" onClick={handleSubmit}>
                Save changes
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Accordion type="single" collapsible className="w-full">
        {savedCollections?.map((collection: CollectionData, index: number) => (
          <AccordionItem value={'item-' + index}>
            <AccordionTrigger>{collection.name}</AccordionTrigger>
            <AccordionContent>
              <CollectionRequest data={collection.requests} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default CollectionsPanel;
