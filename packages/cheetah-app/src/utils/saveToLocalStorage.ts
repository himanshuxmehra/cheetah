// Function to save requests to local storage
interface Header {
  key: string;
  value: string;
}

export interface RequestData {
  type: string;
  url: string;
  body: string;
  headers: Header[];
}

export const saveToLocalStorage = <T>(key: string, data: T): void => {
  try {
    const serializedData = JSON.stringify(data);
    localStorage.setItem(key, serializedData);
  } catch (error) {
    console.error('Error saving to local storage:', error);
  }
};

// Function to load data from local storage
export const loadFromLocalStorage = <T>(key: string): T | null => {
  try {
    const serializedData = localStorage.getItem(key);
    return serializedData ? JSON.parse(serializedData) : null;
  } catch (error) {
    console.error('Error loading from local storage:', error);
    return null;
  }
};

// Save data to local storage
// saveToLocalStorage<RequestData>('myData', dataToSave);

// Load data from local storage
// const loadedData: RequestData | null = loadFromLocalStorage<RequestData>('myData');
