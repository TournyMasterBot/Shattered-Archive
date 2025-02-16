import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Entangle implements IAbility {
    private static instance: Entangle;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Entangle";
        this.helpFile = `
help Entangle
ENTANGLE
ENTANGLE

Syntax: cast entangle <target>

This is a ranger's and druid's means of trapping a target in vines,
spiderwebs, and other naturally occurring things. The victim is stopped in
his tracks and is unable to perform any action.

Because the ranger or druid must be able to find something to use to
entangle a victim, the spell will only be successful in certain sectors.

See also - NATURE RANGER DRUID 
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Entangle.instance === undefined) {
            Entangle.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Entangle {
        if (!Entangle.instance) {
            Entangle.instance = new Entangle();
        }
        return Entangle.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Entangle.GetInstance() as T;
    }
}

export default Entangle;