import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Cleanse implements IAbility {
    private static instance: Cleanse;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Cleanse";
        this.helpFile = `
help cleanse
CLEANSE
CLEANSE

Syntax: cleanse

First learned by the barbarian tribes of the southern plains of Arkania, the
ability to purge all magic from one’s own body quickly passed from one tribe
to the next.  Soon barbarians throughout the entire realm of Algoron had
knowledge of how to strip all magic from themselves through sheer force of
will.  This ability is similar to the spell of cancellation, not
distinguishing between harmful or benign spells though the mental strength
it takes to apply this skill, if overburdened with concentration, the
barbarian may find themselves too exhausted to even move.  

Groups containing this skill: BARBARIAN DEFAULT 
`;
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.manualDescription = "";

        if (Cleanse.instance === undefined) {
            Cleanse.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Cleanse {
        if (!Cleanse.instance) {
            Cleanse.instance = new Cleanse();
        }
        return Cleanse.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Cleanse.GetInstance() as T;
    }
}

export default Cleanse;