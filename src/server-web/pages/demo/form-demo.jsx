import React, { useState } from 'react';
import SelectContinent from './SelectContinent';

const ExampleComponent = () => {
  const [selectedContinent, setSelectedContinent] = useState(null);
  const continentOptions = [
    { value: 'Asia', label: 'Asia' },
    { value: 'Europe', label: 'Europe' },
    // ...other options
  ];

  const handleContinentChange = (selected) => {
    setSelectedContinent(selected);
  };

  return (
    <div>
      <SelectContinent
        continentOptions={continentOptions}
        handleContinentChange={handleContinentChange}
        selectedContinent={selectedContinent}
      />
    </div>
  );
};

export default ExampleComponent;
