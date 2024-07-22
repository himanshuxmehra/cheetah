import { loadFromLocalStorage, saveToLocalStorage } from './saveToLocalStorage';

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

interface CollectionData {
  id: number;
  name: string;
  description: string;
  editable: boolean;
  requests: RequestData[];
}

export const saveToCollection = (data: RequestData, id: number): void => {
  try {
    let loadedData : CollectionData[] | null = loadFromLocalStorage('savedCollections');
    const collectionToEdit = loadedData?.find(collection => collection.id === id);
    if (collectionToEdit) collectionToEdit.requests.push(data);
    loadedData  
      ? saveToLocalStorage('savedCollections', [...loadedData])
      : saveToLocalStorage('savedCollections', []);
  } catch (error) {
    console.error('Error saving to local storage:', error);
  }
};

export const saveRecentRequest = <RequestData>(data: RequestData): void => {
  try {
    let loadedData: Object[] | null = loadFromLocalStorage('recentRequest');
    loadedData === null
      ? saveToLocalStorage('recentRequest', [data])
      : saveToLocalStorage('recentRequest', [...loadedData, data]);
  } catch (error) {
    console.error('Error saving to local storage:', error);
  }
};
