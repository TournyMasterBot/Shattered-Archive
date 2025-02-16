import path from "path";
import IAbility from "@shared/types/ability-types/ability";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import FileSystem from "@shared/util/filesystem";
import ResolveAlias from "@shared/util/resolve-alias-path";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";
import IArea, { IAreaDetails } from "@shared/types/area-types/area-interface";

const ServerCache = {
    baseSharedDir: {} as string,
    filesystem: {} as FileSystem,
    Abilities: {} as Record<string, IAbility>,
    AbilityGroups: {} as Record<string, IAbilityGroup>,
    DamageTypes: {} as Record<string, IDamageType>,
    Areas: {} as Record<string, IArea>,
    Rooms: {} as Record<string, Record<string, IAreaDetails>>,
    async Initialize() {
        this.filesystem = new FileSystem();
        this.baseSharedDir = await ResolveAlias('@shared');
        console.debug("Setting base shared resource path", {
            baseSharedDir: this.baseSharedDir
        })
        await this.InitializeAreas();
        await this.InitializeDamageTypes();
        await this.InitializeAbilities();
        await this.InitializeAbilityGroups();
    },
    async InitializeAbilities(): Promise<void> {
        const abilities: IAbility[] = [];
        // Initialize Skills, Spells, Songs
        const skillsPath = path.join(this.baseSharedDir, "/types/ability-types/skills");
        console.debug("Fetching skills for cache", {
            skillsPath: skillsPath
        })
        const skills = await this.filesystem.importModules(skillsPath);
        abilities.push(...skills);
        const spellsPath = path.join(this.baseSharedDir, "/types/ability-types/spells");
        console.debug("Fetching spells for cache", {
            spellsPath: spellsPath
        })
        const spells = await this.filesystem.importModules(spellsPath);
        abilities.push(...spells);
        const songsPath = path.join(this.baseSharedDir, "/types/ability-types/songs");
        console.debug("Fetching songs for cache", {
            songsPath: songsPath
        })
        const songs = await this.filesystem.importModules(songsPath);
        abilities.push(...songs);

        // Load the server cache
        for(const ability of abilities) {
            const checkAbility = ServerCache.Abilities[ability.name] as IAbility;
            if(checkAbility === undefined) {
                ServerCache.Abilities[ability.name] = ability;
            }
        }

        // DEBUG ONLY :: console.log(JSON.stringify(skills, null, 2));
        console.log(`Ability count: ${abilities.length}, Skills: ${skills.length}, Spells: ${spells.length}, Songs: ${songs.length}`);
    },
    async InitializeAbilityGroups(): Promise<void> {
        const abilityGroups: IAbilityGroup[] = [];
        
        // Initialize Skills, Spells, Songs
        const skillsPath = path.join(this.baseSharedDir, "/types/ability-types/groups-skills");
        const skills = await this.filesystem.importModules(skillsPath);
        abilityGroups.push(...skills);
        const spellsPath = path.join(this.baseSharedDir, "/types/ability-types/groups-spells");
        const spells = await this.filesystem.importModules(spellsPath);
        abilityGroups.push(...spells);
        const songsPath = path.join(this.baseSharedDir, "/types/ability-types/groups-songs");
        const songs = await this.filesystem.importModules(songsPath);
        abilityGroups.push(...songs);

        // Load the server cache
        for(const group of abilityGroups) {
            const checkGroup = ServerCache.AbilityGroups[group.abilityGroup] as IAbilityGroup;
            if(checkGroup === undefined) {
                ServerCache.AbilityGroups[group.abilityGroup] = group;
            }
        }

        // DEBUG ONLY :: console.log(JSON.stringify(skills, null, 2));
        console.log(`Ability Group count: ${abilityGroups.length}, Skills: ${skills.length}, Spells: ${spells.length}, Songs: ${songs.length}`);
    },
    async InitializeDamageTypes(): Promise<void> {
        const damageTypes: IDamageType[] = [];
        const damageTypesPath = path.join(this.baseSharedDir, "/types/damage-types/damage-type-models");
        const types = await this.filesystem.importModules(damageTypesPath);
        damageTypes.push(...types);
        for(const damageType of damageTypes) {
            const checkType = ServerCache.DamageTypes[damageType.name] as IDamageType;
            if(checkType === undefined) {
                ServerCache.DamageTypes[damageType.name] = damageType;
            }
        }
    },
    async InitializeAreas(): Promise<void> {
        const areasPath = path.join(this.baseSharedDir, "/data/areas");
        const areaFiles = await this.filesystem.getAllFiles(`${areasPath}`, true);
        console.log("Found area files", { areaFiles: areaFiles });
        for(const file of areaFiles) {
            if(!file.endsWith(".json")) {
                continue;
            }
            const areaData = await this.filesystem.readFile(`${file}`);
            const area = JSON.parse(areaData) as IArea;
            if(area !== undefined && area.area_id !== undefined && area.area_name !== undefined) {
                const checkArea = ServerCache.Areas[area.area_id];
                if(checkArea === undefined) {
                    ServerCache.Areas[area.area_id] = area;
                    if(area.areaRooms) {
                        for (const key in area.areaRooms) {
                            if (area.areaRooms.hasOwnProperty(key)) {
                                const roomData = area.areaRooms[key];
                                if(roomData.rawName !== undefined) {
                                    if(ServerCache.Rooms[roomData.rawName] === undefined) {
                                        ServerCache.Rooms[roomData.rawName] = {};
                                    }
                                    ServerCache.Rooms[roomData.rawName][key] = roomData;
                                }                                
                            }
                        }
                    }
                }
            }
        }
    }
}

export default ServerCache;