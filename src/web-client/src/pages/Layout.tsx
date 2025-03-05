import React, { useState, useEffect } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // On mount, check for a stored theme
  useEffect(() => {
    const storedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (storedTheme) {
      setTheme(storedTheme);
    }
  }, []);

  // Update localStorage and the document class on theme change
  useEffect(() => {
    localStorage.setItem("theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Toggle theme handler
  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"));
  };

  return (
    <div className="layout">
      <header style={{ padding: "1rem", borderBottom: "1px solid #ccc" }}>
        <button onClick={toggleTheme}>{theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}</button>
      </header>
      <main>{children}</main>
    </div>
  );
};

export default Layout;
