import React, { useState, useEffect, useRef, InputHTMLAttributes } from "react";

export interface SelectBoxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  /**
   * A dictionary of options where the key is the internal value 
   * and the value is the display label.
   */
  options: { [key: string]: string };
  /**
   * Theme indicator. Defaults to "light". You can also pass "dark".
   */
  theme?: "light" | "dark";
  /**
   * Callback when an option is selected.
   */
  onSelectChange?: (value: string) => void;
  /**
   * Optionally set a selected value.
   */
  value?: string;
  /**
   * Placeholder text for the input.
   */
  placeholder?: string;
  /**
   * Optional id for the input element.
   */
  id?: string;
  /**
   * Optional name for the input element.
   */
  name?: string;
  /**
   * Optional additional data attributes as a dictionary.
   */
  data?: { [key: string]: string };
}

const SelectBox: React.FC<SelectBoxProps> = ({
  options,
  theme = "light",
  onSelectChange,
  value,
  placeholder = "Select...",
  id,
  name,
  data,
  ...rest
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter options based on the query (search in both key and label)
  const filteredOptions = Object.entries(options).filter(
    ([key, label]) =>
      key.toLowerCase().includes(query.toLowerCase()) ||
      label.toLowerCase().includes(query.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (key: string) => {
    setSelected(key);
    setQuery("");
    setIsOpen(false);
    if (onSelectChange) {
      onSelectChange(key);
    }
  };

  // Prepare additional data attributes (e.g., data-custom="value")
  const dataAttributes = data
    ? Object.keys(data).reduce<Record<string, string>>((acc, key) => {
        acc[`data-${key}`] = data[key];
        return acc;
      }, {})
    : {};

  // Basic inline styles; these can be replaced or extended with your own theming
  const styles = {
    container: {
      position: "relative" as "relative",
      width: "250px",
    },
    input: {
      width: "100%",
      padding: "8px",
      borderRadius: "4px",
      border: "1px solid #ccc",
      backgroundColor: theme === "dark" ? "#333" : "#fff",
      color: theme === "dark" ? "#fff" : "#000",
      boxSizing: "border-box" as "border-box",
    },
    dropdown: {
      position: "absolute" as "absolute",
      top: "100%",
      left: 0,
      right: 0,
      border: "1px solid #ccc",
      borderTop: "none",
      maxHeight: "200px",
      overflowY: "auto" as "auto",
      backgroundColor: theme === "dark" ? "#333" : "#fff",
      zIndex: 1000,
    },
    option: {
      padding: "8px",
      cursor: "pointer",
      borderBottom: "1px solid #eee",
    },
    optionHover: {
      backgroundColor: theme === "dark" ? "#444" : "#f0f0f0",
    },
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <input
        type="text"
        id={id}
        name={name}
        style={styles.input}
        placeholder={placeholder}
        // Spread additional data attributes
        {...dataAttributes}
        {...rest}
        value={isOpen ? query : selected ? options[selected] : ""}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
      />
      {isOpen && filteredOptions.length > 0 && (
        <div style={styles.dropdown}>
          {filteredOptions.map(([key, label]) => (
            <div
              key={key}
              style={styles.option}
              onClick={() => handleSelect(key)}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor =
                  theme === "dark" ? "#444" : "#f0f0f0")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SelectBox;
