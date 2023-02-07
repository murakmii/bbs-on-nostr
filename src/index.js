import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ToS from './ToS';
import Thread from './Thread';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: 'tos',
        element: <ToS />,
      },
      {
        path: 'threads/:id',
        element: <Thread />,
      },
    ],
  },
]);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
