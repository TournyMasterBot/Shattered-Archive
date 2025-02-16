import fs from "fs/promises";
import path from "path";
import DslError from "@shared/types/error-types/dsl-error";
import IFileSystem from "@shared/util/filesystem-interface";

export class FileSystem implements IFileSystem {
  constructor() {}

  initialize(): void {}

  public async readFile(filePath: string): Promise<string> {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return data;
    } catch (err: any) {
      throw new DslError({
        message: `Failed to read file: ${filePath}`,
        traceLocation: "FileSystem.readFile.error",
        stack: err.stack,
      });
    }
  }

  public async writeFile(filePath: string, content: string): Promise<void> {
    try {
      await fs.writeFile(filePath, content, "utf-8");
    } catch (err: any) {
      throw new DslError({
        message: `Failed to write file: ${filePath}`,
        traceLocation: "FileSystem.writeFile.error",
        stack: err.stack,
      });
    }
  }

  public async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch (err) {
      return false;
    }
  }

  public async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      throw new DslError({
        message: `Failed to delete file: ${filePath}`,
        traceLocation: "FileSystem.deleteFile.error",
        stack: err.stack,
      });
    }
  }

  public async getAllFiles(
    directoryPath: string,
    includeSubdirectories: boolean = false,
  ): Promise<string[]> {
    try {
      let files: string[] = [];

      // Attempt to read the directory entries
      const dirents = await fs.readdir(directoryPath, { withFileTypes: true });

      for (const dirent of dirents) {
        const fullPath = path.join(directoryPath, dirent.name);

        if (dirent.isDirectory() && includeSubdirectories) {
          // Recursively get files in subdirectories
          const subdirectoryFiles = await this.getAllFiles(fullPath, true);
          files.push(...subdirectoryFiles);
        } else if (dirent.isFile()) {
          files.push(fullPath);
        }
      }

      return files;
    } catch (err: any) {
      // Handle specific errors
      if (err.code === "ENOENT") {
        // Directory does not exist
        console.warn(`Directory does not exist or is empty: ${directoryPath}`);
        return []; // Return an empty list instead of throwing an error
      } else {
        // Throw a detailed DslError for other errors
        throw new DslError({
          message: `Failed to get files in directory: ${directoryPath}`,
          traceLocation: "FileSystem.getAllFiles.error",
          stack: err.stack,
        });
      }
    }
  }

  public async getDirectoryExists(directoryPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(directoryPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  public async createDirectory(
    directoryPath: string,
    createIfParentDoesNotExist: boolean,
  ): Promise<void> {
    try {
      await fs.mkdir(directoryPath, { recursive: createIfParentDoesNotExist });
    } catch (err: any) {
      if (err.code !== "EEXIST") {
        throw new DslError({
          message: `Failed to create directory: ${directoryPath}`,
          traceLocation: "FileSystem.createDirectory.error",
          stack: err.stack,
        });
      }
    }
  }

  public async importModules(directory: string): Promise<any[]> {
    try {
      // Resolve the directory to an absolute path
      const absDirectory = path.resolve(directory);
      const files = await fs.readdir(absDirectory);
      const filePaths = files.map((file) => path.join(absDirectory, file));

      // Process all files concurrently
      const modules = await Promise.all(
        filePaths.map(async (filePath) => {
          try {
            const stats = await fs.lstat(filePath);
            // Skip directories
            if (stats.isDirectory()) return null;

            // Allow .js and .ts files, but skip declaration files.
            const ext = path.extname(filePath);
            if (ext === ".d.ts" || (ext !== ".js" && ext !== ".ts"))
              return null;

            // Dynamically require the module (ts-node handles .ts files)
            const mod = require(filePath);
            const imported = mod.default || mod;

            if (typeof imported === "function") {
              // Instantiate the class and return it.
              return new imported();
            }
            return null;
          } catch (error) {
            console.error(`Error processing file ${filePath}:`, error);
            return null;
          }
        }),
      );

      // Filter out any null results (files that were skipped or errored)
      const items = modules.filter((item) => item !== null);
      console.log(`${directory} :: Found items: ${items.length}`);
      return items;
    } catch (error) {
      console.error(`Error importing modules from ${directory}:`, error);
      return [];
    }
  }
}

export function createFileSystem(): IFileSystem {
  return new FileSystem();
}

export default FileSystem;
