import IAbility from "@shared/types/ability-types/ability";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import { IStatAttribute } from "@shared/types/character-types/stat-attribute";
import IDslArmorType from "@shared/types/item-types/armor-type-interface";
import { IRace } from "@shared/types/character-types/race-interface";
import { IClassType } from "@shared/types/character-types/class-type";

export interface IDslClass {
    name: string;
    displayName: string;
    isMortalClass: boolean;
    isReclass: boolean;
    isCsr: boolean;
    baseClass: IClassType;
    classType: IClassType;
    imgUrl: string;
    primaryAttribute: IStatAttribute;
    secondaryAttribute: IStatAttribute;
    armorType: IDslArmorType;
    classGroup: string;
    raceRestrictions: IRace[];
    /**
     * This map is the CP cost to take a particular spellgroup at character creation
     */
    characterCreationAbilityGroups: { [groupName: string]: {
        cpCost: number,
        abilityGroup: IAbilityGroup
    } };
    /**
     * This map is the CP cost to take a particular skill at character creation
     */
    characterCreationSkills: { [abilityName: string]: number };
    /**
     * This map is the level at which a character will get a particular ability
     * Abilities may be skills, spells, or songs
     */
    abilities: Map<number, IAbility[]>;
    baseCpModifier: number;
    helpfile: string;
    castsAtLevel: boolean;
    castingLevelModifier: number;
    notes?: string;
    cpRacialModifiers: Record<string, number>;
    buffActions?: IAbility[];
    isMoonAffected?: boolean;
}

export default IDslClass;