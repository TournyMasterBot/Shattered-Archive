import IAbility from "@shared/types/ability-types/ability";
import { IStatAttribute } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";

export interface IRace {
    id: string;
    name: string;
    imageUrl: string;
    displayName: string;
    description?: string;
    isLimitedRace: boolean;
    isMortalRace: boolean;
    isLargeRace: boolean;
    stats: IStatAttribute[];
    primaryAttributeModifier: IStatAttribute;
    secondaryAttributeModifier: IStatAttribute;
    immunities: IDamageType[];
    resistances: IDamageType[];
    vulnerabilities: IDamageType[];
    racialAbilities: IAbility[];
    availableClasses: IDslClass[];
    restrictedClasses: IDslClass[];
    boostedClasses: Map<IDslClass, BoostedClass[]>;
    
    // TODO : Resistances
    // TODO : Vulnerabilities
    // TODO : Boosted Classes
    // TODO : Available Classes
    // TODO : Restricted Classes
}

export default IRace;