import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Firebolt implements IAbility {
    private static instance: Firebolt;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Firebolt";
        this.helpFile = `
FIREBOLT

Syntax: cast 'firebolt' <target>

Drawing on Zandreyas teachings, the Eldritch is able to channel their energy
in order to direct a long lance of fire at their enemy.  While painful upon
any foe, it is moreso against those sensitive to fire.  

Groups containing this spell: ELDRITCH
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Firebolt.instance === undefined) {
            Firebolt.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Firebolt {
        if (!Firebolt.instance) {
            Firebolt.instance = new Firebolt();
        }
        return Firebolt.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Firebolt.GetInstance() as T;
    }
}

export default Firebolt;