import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

interface ChildComponentProps {
  data: Object[];
}

const CollectionRequest:React.FC<ChildComponentProps> = ({ data }) => {
  return (
    <div>
      <Table>
        <TableCaption>collection descp</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/5">Method</TableHead>
            <TableHead className="w-4/5">Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((req: any) => (
            <TableRow key={req.invoice}>
              <TableCell className="font-medium">{req.type}</TableCell>
              <TableCell className="text-left">{req.url}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default CollectionRequest;
