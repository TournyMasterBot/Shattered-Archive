import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CurePoison implements IAbility {
    private static instance: CurePoison;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Cure Poison";
        this.helpFile = `
help 'Cure Poison'
'CURE POISON'
'CURE POISON'

Syntax: cast 'cure poison' <character>

This spell cures general poisons that have afflicted a given character.  

See also - CURATIVE 
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (CurePoison.instance === undefined) {
            CurePoison.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): CurePoison {
        if (!CurePoison.instance) {
            CurePoison.instance = new CurePoison();
        }
        return CurePoison.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CurePoison.GetInstance() as T;
    }
}

export default CurePoison;