import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class FocusedAggression implements IAbility {
    private static instance: FocusedAggression;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Focused Aggression";
        this.helpFile = `
FOCUSED AGGRESSION

This spell will allow the mentalist to make his or her friends (or their self)
much more focused upon the battlefield, resulting in much stronger and 
precise hits. This spell gains power as the mentalist gains levels. 

Syntax: cast 'focused aggression' <target>
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (FocusedAggression.instance === undefined) {
            FocusedAggression.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): FocusedAggression {
        if (!FocusedAggression.instance) {
            FocusedAggression.instance = new FocusedAggression();
        }
        return FocusedAggression.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return FocusedAggression.GetInstance() as T;
    }
}

export default FocusedAggression;