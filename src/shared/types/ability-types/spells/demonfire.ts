import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Demonfire implements IAbility {
    private static instance: Demonfire;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Demonfire";
        this.helpFile = `
help 'Demonfire'
DEMONFIRE

Syntax: cast 'demonfire' <target>

Demonfire is a spell of blackest evil, and as such can only be used
correctly by those who follow the paths of darkness.  It conjures forth
demonic spirits to inflict terrible wounds on the enemies of the caster.

See also - ATTACK 
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Demonfire.instance === undefined) {
            Demonfire.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Demonfire {
        if (!Demonfire.instance) {
            Demonfire.instance = new Demonfire();
        }
        return Demonfire.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Demonfire.GetInstance() as T;
    }
}

export default Demonfire;