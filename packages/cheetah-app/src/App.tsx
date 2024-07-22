import { ThemeProvider } from './components/theme-provider';
import Header from './components/header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RecentPage from './pages/recent-page';
import Collections from './pages/collections';

function App() {

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="w-full px-8 py-6">
        <Header />
        <div className="flex justify-center w-full">
          <Tabs defaultValue="recent" className="w-full text-center p-8">
            <TabsList>
              <TabsTrigger value="recent">Recent</TabsTrigger>
              <TabsTrigger value="collections">Collections</TabsTrigger>
            </TabsList>
            <TabsContent value="recent" className="pt-4">
              <RecentPage />
            </TabsContent>
            <TabsContent value="collections" className="pt-4">
              <Collections />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
