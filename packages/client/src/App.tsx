import { useMemo } from 'react';
import { loadContent } from './content';
import { MapLab } from './lab/MapLab';

export function App() {
  const content = useMemo(loadContent, []);
  return <MapLab content={content} />;
}
