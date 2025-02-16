import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DragonFear implements IAbility {
    private static instance: DragonFear;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Dragon Fear";
        this.helpFile = `
help 'Dragon Fear'
'DRAGON FEAR'
Syntax: cast 'dragon fear' <target>

This spell instills a deep-seated fear in the target, causing them to flee from the caster in terror.
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (DragonFear.instance === undefined) {
            DragonFear.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): DragonFear {
        if (!DragonFear.instance) {
            DragonFear.instance = new DragonFear();
        }
        return DragonFear.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DragonFear.GetInstance() as T;
    }
}

export default DragonFear;