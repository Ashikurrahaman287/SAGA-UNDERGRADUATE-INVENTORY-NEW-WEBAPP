import { RouterProvider } from 'react-router-dom';
import type { ReactElement } from 'react';
import { router } from './router';

export function App(): ReactElement {
  return <RouterProvider router={router} />;
}
