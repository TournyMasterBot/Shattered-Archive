import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CureSerious implements IAbility {
    private static instance: CureSerious;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Cure Serious";
        this.helpFile = `
help 'Cure Serious'
'CURE LIGHT' 'CURE SERIOUS' 'CURE CRITICAL' HEAL
'CURE LIGHT' 'CURE SERIOUS' 'CURE CRITICAL' HEAL
Syntax: cast 'cure light'    <character>
Syntax: cast 'cure serious'  <character>
Syntax: cast 'cure critical' <character>
Syntax: cast 'heal'          <character>
These spells cure damage on the target character. The higher-level spells
heal more damage.
(see 'help healer' for details on the heal command)
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (CureSerious.instance === undefined) {
            CureSerious.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): CureSerious {
        if (!CureSerious.instance) {
            CureSerious.instance = new CureSerious();
        }
        return CureSerious.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CureSerious.GetInstance() as T;
    }
}

export default CureSerious;