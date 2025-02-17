import path from "path";
import IAbility from "@shared/types/ability-types/ability";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import FileSystem from "@shared/util/filesystem";
import ResolveAlias from "@shared/util/resolve-alias-path";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IArea, { IAreaDetails } from "@shared/types/area-types/area-interface";
import { v4 } from "uuid";
import IRace from "@shared/types/character-types/race-interface";
import IDslClass from "@shared/types/character-types/dslClass";

const secretDirectoryPath = path.join(__dirname, "secrets");
const secretPath = path.join(`${secretDirectoryPath}`, "jwt-secret.dat");
console.log("Secrets Directory", {
  secretPath: secretPath,
});

export interface ServerCacheProps {
  serviceName: string;
  gameCache: GameCacheProps;
}

export interface GameCacheProps {
  initializeAreas: boolean;
  initializeDamageTypes: boolean;
  initializeAbilities: boolean;
  initializeAbilityGroups: boolean;
  initializeRaces: boolean;
  initializeClasses: boolean;
}

const ServerCache = {
  serviceName: {} as string,
  baseSharedDir: {} as string,
  jwtSecret: {} as string,
  filesystem: {} as FileSystem,
  Abilities: {} as Record<string, IAbility>,
  AbilityGroups: {} as Record<string, IAbilityGroup>,
  DamageTypes: {} as Record<string, IDamageType>,
  Areas: {} as Record<string, IArea>,
  Rooms: {} as Record<string, Record<string, IAreaDetails>>,
  Races: {} as Record<string, IRace>,
  Classes: {} as Record<string, IDslClass>,
  async Initialize(props: ServerCacheProps) {
    this.filesystem = new FileSystem();
    this.serviceName = props.serviceName;
    const secretsDirectoryExists = await this.filesystem.getDirectoryExists(`${secretDirectoryPath}`);
    if (secretsDirectoryExists === false) {
      await this.filesystem.createDirectory(`${secretDirectoryPath}`, true);
    }
    const jwtSecretFileExists = await this.filesystem.fileExists(secretPath);
    if (jwtSecretFileExists === false) {
      this.jwtSecret = v4();
      await this.filesystem.writeFile(`${secretPath}`, this.jwtSecret);
    } else {
      this.jwtSecret = await this.filesystem.readFile(`${secretPath}`);
    }
    this.baseSharedDir = await ResolveAlias("@shared");
    console.debug("Setting base shared resource path", {
      baseSharedDir: this.baseSharedDir,
    });
    if (props.gameCache) {
      if (props.gameCache.initializeAreas) {
        await this.InitializeAreas();
      }
      if (props.gameCache.initializeDamageTypes) {
        await this.InitializeDamageTypes();
      }
      if (props.gameCache.initializeAbilities) {
        await this.InitializeAbilities();
      }
      if (props.gameCache.initializeAbilityGroups) {
        await this.InitializeAbilityGroups();
      }
      if (props.gameCache.initializeRaces) {
        await this.InitializeRaces();
      }
      if(props.gameCache.initializeClasses) {
        await this.InitializeClasses();
      }
    }
  },
  async InitializeAbilities(): Promise<void> {
    // Define the paths for each ability type.
    const skillsPath = path.join(this.baseSharedDir, "types/ability-types/skills");
    const spellsPath = path.join(this.baseSharedDir, "types/ability-types/spells");
    const songsPath = path.join(this.baseSharedDir, "types/ability-types/songs");

    console.debug("Fetching abilities for cache", {
      skillsPath,
      spellsPath,
      songsPath,
    });

    // Import the modules concurrently.
    const [skills, spells, songs] = await Promise.all([
      this.filesystem.importModules(skillsPath),
      this.filesystem.importModules(spellsPath),
      this.filesystem.importModules(songsPath),
    ]);

    // Merge all abilities from the three arrays.
    const abilities = [...skills, ...spells, ...songs];

    // Load the server cache with the abilities.
    for (const ability of abilities) {
      if (ServerCache.Abilities[ability.name] === undefined) {
        ServerCache.Abilities[ability.name] = ability;
      }
    }

    console.log(`Ability count: ${abilities.length}, Skills: ${skills.length}, Spells: ${spells.length}, Songs: ${songs.length}`);
  },
  async InitializeAbilityGroups(): Promise<void> {
    // Define paths for each group type.
    const skillsPath = path.join(this.baseSharedDir, "types/ability-types/groups-skills");
    const spellsPath = path.join(this.baseSharedDir, "types/ability-types/groups-spells");
    const songsPath = path.join(this.baseSharedDir, "types/ability-types/groups-songs");

    console.log("Fetching ability groups for cache", {
      skillsPath,
      spellsPath,
      songsPath,
    });

    // Import modules concurrently.
    const [skills, spells, songs] = await Promise.all([
      this.filesystem.importModules(skillsPath),
      this.filesystem.importModules(spellsPath),
      this.filesystem.importModules(songsPath),
    ]);

    // Merge all imported ability groups.
    const abilityGroups = [...skills, ...spells, ...songs];

    // Load the server cache.
    for (const group of abilityGroups) {
      if (ServerCache.AbilityGroups[group.abilityGroup] === undefined) {
        ServerCache.AbilityGroups[group.abilityGroup] = group;
      }
    }

    console.log(`Ability Group count: ${abilityGroups.length}, Skills: ${skills.length}, Spells: ${spells.length}, Songs: ${songs.length}`);
  },
  async InitializeDamageTypes(): Promise<void> {
    const damageTypes: IDamageType[] = [];
    const damageTypesPath = path.join(this.baseSharedDir, "types/damage-types/damage-type-models");
    console.log("Fetching damage types for cache", {
      damageTypesPath,
    });
    const types = await this.filesystem.importModules(damageTypesPath);
    damageTypes.push(...types);
    for (const damageType of damageTypes) {
      const checkType = ServerCache.DamageTypes[damageType.name] as IDamageType;
      if (checkType === undefined) {
        ServerCache.DamageTypes[damageType.name] = damageType;
      }
    }
  },
  async InitializeAreas(): Promise<void> {
    const areasPath = path.join(this.baseSharedDir, "data/areas");
    const areaFiles = await this.filesystem.getAllFiles(areasPath, true);

    // Filter for only JSON files.
    const jsonFiles = areaFiles.filter((file) => file.endsWith(".json"));
    console.log("Found area files", { jsonFiles });

    // Process all JSON files in parallel.
    await Promise.all(
      jsonFiles.map(async (file) => {
        const areaData = await this.filesystem.readFile(file);
        const area = JSON.parse(areaData) as IArea;
        if (area && area.area_id !== undefined && area.area_name !== undefined) {
          // Only add the area if it isn't already present.
          if (ServerCache.Areas[area.area_id] === undefined) {
            ServerCache.Areas[area.area_id] = area;
            if (area.areaRooms) {
              for (const key in area.areaRooms) {
                if (Object.prototype.hasOwnProperty.call(area.areaRooms, key)) {
                  const roomData = area.areaRooms[key];
                  if (roomData.rawName !== undefined) {
                    // Initialize the room object if needed.
                    if (ServerCache.Rooms[roomData.rawName] === undefined) {
                      ServerCache.Rooms[roomData.rawName] = {};
                    }
                    ServerCache.Rooms[roomData.rawName][key] = roomData;
                  }
                }
              }
            }
          }
        }
      }),
    );
  },
  async InitializeRaces(): Promise<void> {
    const racesPath = path.join(this.baseSharedDir, "types/race-types");

    console.debug("Fetching races for cache", {
      racesPath,
    });

    const [races] = await Promise.all([this.filesystem.importModules(racesPath)]);
    for (const race of races) {
      if (ServerCache.Races[race.name] === undefined) {
        ServerCache.Races[race.name] = race;
      }
    }

    console.log(`Race count: ${races.length}`);
  },
  async InitializeClasses(): Promise<void> {
    const classesPath = path.join(this.baseSharedDir, "types/class-types");

    console.debug("Fetching classes for cache", {
      classesPath,
    });
    
    const [classes] = await Promise.all([this.filesystem.importModules(classesPath)]);
    for (const dslClass of classes) {
      if (ServerCache.Races[dslClass.name] === undefined) {
        ServerCache.Races[dslClass.name] = dslClass;
      }
    }

    console.log(`Classes count: ${classes.length}`);
  },
  GetRaceByName(raceName: string): IRace | undefined {
    const race = ServerCache.Races[raceName];
    return race;
  },
};

export default ServerCache;
