import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Recover implements IAbility {
    private static instance: Recover;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Recover";
        this.helpFile = `
RECOVER  -  Mentalist Spell

Power over the mind has led the mentalist to develop a spell in which their mind
can heal their physical wounds. Casting recover will allow the mentalist to heal
some of their damage so they may continue their tasks at hand.

Syntax :  cast 'recover' self
        `;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Recover.instance === undefined) {
            Recover.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Recover {
        if (!Recover.instance) {
            Recover.instance = new Recover();
        }
        return Recover.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Recover.GetInstance() as T;
    }
}

export default Recover;