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
import IDslItem from "@shared/types/item-types/dsl-item-interface";
import itemData from "@shared/types/item-types/raw-data/items.json";
import itemManualData from "@shared/types/item-types/raw-data/item-manual-data.json";

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
  initializeItems: boolean;
}

const ServerCache = {
  serviceName: {} as string,
  baseSharedDir: {} as string,
  cacheLoaded: {} as boolean,
  jwtSecret: {} as string,
  filesystem: {} as FileSystem,
  Abilities: {} as Record<string, IAbility>,
  AbilityGroups: {} as Record<string, IAbilityGroup>,
  DamageTypes: {} as Record<string, IDamageType>,
  Areas: {} as Record<string, IArea>,
  Rooms: {} as Record<string, Record<string, IAreaDetails>>,
  Races: {} as Record<string, IRace>,
  Classes: {} as Record<string, IDslClass>,
  Items: {} as Record<string, IDslItem>,
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
    this.cacheLoaded = false;
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
      if (props.gameCache.initializeRaces) {
        await this.InitializeRaces();
      }
      if (props.gameCache.initializeClasses) {
        await this.InitializeClasses();
      }
      if (props.gameCache.initializeItems) {
       await this.InitializeItems();
      }
    
      // !IMPORTANT! LOAD ABILITY GROUPS BEFORE ABILITIES :: OPTIMIZATIONS IN PLACE!
      if (props.gameCache.initializeAbilityGroups) {
        await this.InitializeAbilityGroups();
      }
      if (props.gameCache.initializeAbilities) {
       await this.InitializeAbilities();
      }
      
      this.cacheLoaded = true;
    }
  },
  async InitializeAbilities(): Promise<void> {
    // Define the paths for each ability type.
    const skillsPath = path.join(this.baseSharedDir, "types", "ability-types", "skills");
    const spellsPath = path.join(this.baseSharedDir, "types", "ability-types", "spells");
    const songsPath = path.join(this.baseSharedDir, "types", "ability-types", "songs");

    console.debug("Fetching abilities for cache", {
      skillsPath,
      spellsPath,
      songsPath,
    });

    // Import the modules concurrently.
    const excludeFileKeys: string[] = [
      ...Object.keys(this.Abilities)
    ]
    const [skills, spells, songs] = await Promise.all([
      this.filesystem.importModules(skillsPath, excludeFileKeys),
      this.filesystem.importModules(spellsPath, excludeFileKeys),
      this.filesystem.importModules(songsPath, excludeFileKeys),
    ]);

    // Merge all abilities from the three arrays.
    const abilities = [...skills, ...spells, ...songs];

    // Load the server cache with the abilities.
    for (const ability of abilities) {
      const key = ability.name.trim();
      if (ServerCache.Abilities[key] === undefined) {
        ServerCache.Abilities[key] = ability;
      }
    }

    console.debug("Finished loading abilities", {
      AbilityCount: Object.keys(this.Abilities).length,
      UnattachedSkills: skills.length,
      UnattachedSpells: spells.length,
      UnattachedSongs: songs.length,
      //Skills: skills,
      //Spells: spells,
      //Songs: songs
    });
  },
  async InitializeAbilityGroups(): Promise<void> {
    // Define paths for each group type.
    const skillsPath = path.join(this.baseSharedDir, "types","ability-types","groups-skills");
    const spellsPath = path.join(this.baseSharedDir, "types","ability-types","groups-spells");
    const songsPath = path.join(this.baseSharedDir, "types","ability-types","groups-songs");
    const classPath = path.join(this.baseSharedDir, "types","ability-types","groups-class");
    const racialPath = path.join(this.baseSharedDir, "types","ability-types","groups-race");

    console.log("Fetching ability groups for cache", {
      skillsPath,
      spellsPath,
      songsPath,
      racialPath,
      classPath
    });

    // Import modules concurrently.
    const excludeFileKeys: string[] = [
      ...Object.keys(this.AbilityGroups)
    ]
    const [skills, spells, songs] = await Promise.all([
      this.filesystem.importModules(skillsPath, excludeFileKeys),
      this.filesystem.importModules(spellsPath, excludeFileKeys),
      this.filesystem.importModules(songsPath, excludeFileKeys),
      this.filesystem.importModules(racialPath, excludeFileKeys),
      this.filesystem.importModules(classPath, excludeFileKeys),
    ]);

    // Merge all imported ability groups.
    const abilityGroups = [...skills, ...spells, ...songs];
    // Load the server cache.
    for (const group of abilityGroups) {
      const key = group.abilityGroup.trim();
      if (ServerCache.AbilityGroups[key] === undefined) {
        ServerCache.AbilityGroups[key] = group;
      }
    }
    console.debug("Finished loading ability groups", {
      AbilityGroupsCount: Object.keys(this.AbilityGroups).length,
      UnattachedSkillGroups: skills.length,
      UnattachedSpellGroups: spells.length,
      UnattachedSongGroups: songs.length,
      //SkillGroups: skills,
      //SpellGroups: spells,
      //SongGroups: songs
    });
  },
  async InitializeDamageTypes(): Promise<void> {
    const damageTypes: IDamageType[] = [];
    const damageTypesPath = path.join(this.baseSharedDir, "types", "damage-types", "damage-type-models");
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
    const areasPath = path.join(this.baseSharedDir, "data", "areas");
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
            if (area.items === undefined) {
              area.items = {};
            }
          }
        }
      }),
    );
  },
  async InitializeRaces(): Promise<void> {
    const racesPath = path.join(this.baseSharedDir, "types", "race-types");

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
    const classesPath = path.join(this.baseSharedDir, "types", "class-types");

    console.debug("Fetching classes for cache", {
      classesPath,
    });

    const [classes] = await Promise.all([this.filesystem.importModules(classesPath)]);
    for (const dslClass of classes) {
      if (ServerCache.Classes[dslClass.name] === undefined) {
        ServerCache.Classes[dslClass.name] = dslClass;
      }
    }

    console.log(`Classes count: ${classes.length}`);
  },
  async InitializeItems(): Promise<void> {
    console.debug("Adding items to item cache");
    const processItems = itemData as IDslItem[];
    processItems.forEach((item: IDslItem) => {
      ServerCache.Items[item.item_hash] = item;
      const areaName = item.area_found?.replace("/\s/g", "");
      const area = this.GetAreaByName(areaName);
      if (area !== undefined) {
        area.items[item.item_name] = item;
      }
    });
    const manualItems = itemManualData as IDslItem[];
    manualItems.forEach((enrichedItem: IDslItem) => {
      const key = enrichedItem.item_hash;
      const existingItem = ServerCache.Items[key];

      if (existingItem) {
        // If the item exists, update its properties with the enriched data.
        // This will overwrite existing values with those from the enriched item.
        Object.assign(existingItem, enrichedItem);
      } else {
        // Otherwise, add the new item to the cache.
        ServerCache.Items[key] = enrichedItem;
      }

      // Enrich areas with known item information
      const area = this.GetAreaByName(enrichedItem.area_found);
      if (area !== undefined) {
        const existingItemInArea = area.items[enrichedItem.item_hash];
        if (existingItemInArea) {
          // If the item exists, update its properties with the enriched data.
          // This will overwrite existing values with those from the enriched item.
          Object.assign(existingItemInArea, enrichedItem);
          area.items[key] = existingItemInArea;
        } else {
          // Otherwise, add the new item to the cache.
          area.items[key] = existingItemInArea;
        }
      }
    });

    console.log(`Items count: ${processItems.length}, Manual Items Count: ${manualItems.length}`);
  },
  GetAreaByName(areaName: string): IArea | undefined {
    if(areaName === undefined) {
      return undefined;
    }
    const key = areaName.toLowerCase().trim();
    const area = ServerCache.Areas[key];
    return area;
  },
  GetRaceByName(raceName: string): IRace | undefined {
    const race = ServerCache.Races[raceName];
    return race;
  },
  GetClassByName(className: string): IDslClass | undefined {
    const dslClass = ServerCache.Classes[className];
    return dslClass;
  },
  GetItemById(itemKey: string): IDslItem | undefined {
    const item = ServerCache.Items[itemKey];
    return item;
  },
  GetAbilityGroupByName(abilityGroupName: string): IAbilityGroup | undefined {
    if(abilityGroupName === undefined) {
      return undefined;
    }
    const key = abilityGroupName.trim();
    const abilityGroup = ServerCache.AbilityGroups[key];
    return abilityGroup;
  },
  GetAbilityByName(abilityName: string): IAbility | undefined {
    if(abilityName === undefined) {
      return undefined;
    }
    const key = abilityName.trim();
    const ability = ServerCache.Abilities[key];
    return ability;
  }
};

export default ServerCache;
