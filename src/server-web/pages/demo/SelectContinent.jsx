import React from 'react';
import Select from 'react-select';
import styles from '../../../styles/ui-elements/form.module.scss'

const SelectContinent = ({ continentOptions, handleContinentChange, selectedContinent }) => {
  return (
    <div className={styles.formGroup}>
      <label className={styles.label}>Select Continent</label>
      <Select
        options={continentOptions}
        onChange={handleContinentChange}
        placeholder="Select Continent"
        isClearable
        styles={customSelectStyles}
        className={styles.dropdown}
        value={selectedContinent}
      />
    </div>
  );
};

export default SelectContinent;
