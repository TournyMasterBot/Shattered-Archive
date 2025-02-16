interface IFileSystem {
    readFile(filePath: string): Promise<string>;
    writeFile(filePath: string, content: string): Promise<void>;
    fileExists(filePath: string): Promise<boolean>;
    deleteFile(filePath: string): Promise<void>;
    getAllFiles(directoryPath: string, includeSubdirectories?: boolean): Promise<string[]>;
    createDirectory(directoryPath: string, createIfParentDoesNotExist: boolean): Promise<void>;
    getDirectoryExists(directoryPath: string): Promise<boolean>;
    importModules(directory: string): Promise<any[]>;
}

export default IFileSystem;