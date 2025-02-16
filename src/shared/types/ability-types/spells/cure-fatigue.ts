import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CureFatigue implements IAbility {
    private static instance: CureFatigue;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Cure Fatigue";
        this.helpFile = `
help 'Cure Fatigue'
'CURE FATIGUE'
'CURE FATIGUE'

Syntax: cast 'cure fatigue' <character>

This spell restores vitality to a character afflicted by the poison of the
hobgoblin.  

See also - CURATIVE 
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (CureFatigue.instance === undefined) {
            CureFatigue.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): CureFatigue {
        if (!CureFatigue.instance) {
            CureFatigue.instance = new CureFatigue();
        }
        return CureFatigue.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CureFatigue.GetInstance() as T;
    }
}

export default CureFatigue;