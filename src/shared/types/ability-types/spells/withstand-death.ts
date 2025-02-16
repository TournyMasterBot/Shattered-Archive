import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class WithstandDeath implements IAbility {
    private static instance: WithstandDeath;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Withstand Death";
        this.helpFile =
`WITHSTAND DEATH

Syntax: cast 'withstand death'

The ability to defy death itself lies solely in the hands of the
Necromancers of the Conclave. This spell extends the life of the
Necromancer, staving off his death as long as possible.

Necromancers who are "killed" while this spell is in effect will indeed die
and suffer the regular penalties of death. To all outward appearances,
however, they simply do not die.

See also - NECROMANCY NECROMANCER`;
        this.abilityGroupType = AbilityGroupType.Unknown; // Adjust if necessary
        this.abilityUsage = AbilityUsage.Active;

        if (WithstandDeath.instance === undefined) {
            WithstandDeath.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): WithstandDeath {
        if (!WithstandDeath.instance) {
            WithstandDeath.instance = new WithstandDeath();
        }
        return WithstandDeath.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return WithstandDeath.GetInstance() as T;
    }
}

export default WithstandDeath;