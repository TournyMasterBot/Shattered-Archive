import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Nexus implements IAbility {
    private static instance: Nexus;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Nexus";
        this.helpFile = `
help 'Nexus'
'NEXUS'
NEXUS
Syntax: cast 'nexus' <target>
This spell is virtually identical to portal (see 'help portal'), with the
only difference being that while portal creates a one-way gate, a nexus 
spell makes a two-sided gate.  It also lasts longer than the lower-powered
portal spell.  Both spells require an additional power source, the secret
of which has been lost... This spell can traverse the boundaries of continents.
`;
        this.abilityGroupType = AbilityGroupType.Unknown; // Set appropriate group type
        this.abilityUsage = AbilityUsage.Active;

        if (Nexus.instance === undefined) {
            Nexus.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Nexus {
        if (!Nexus.instance) {
            Nexus.instance = new Nexus();
        }
        return Nexus.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Nexus.GetInstance() as T;
    }
}

export default Nexus;