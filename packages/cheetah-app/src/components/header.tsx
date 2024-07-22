import { ModeToggle } from './mode-toggle';

function Header() {
  return (
    <div className="grid grid-cols-3">
      <div className='flex col-span-2 text-start'>
      {/* <img src="../assets/icon.svg"/> */}
        <h1 className="text-2xl font-semibold hover:underline">Cheetah</h1>
      </div>
      <div className='text-end'>
        <ModeToggle />
      </div>
    </div>
  );
}

export default Header;
