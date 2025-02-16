import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Pyro implements IAbility {
    private static instance: Pyro;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Pyro";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
PYRO

Syntax: Pyro

Utilizing a small incendiary device, the Ninja can create a cloud of smoke
and fire, burning all targets in the room while disappearing into the
environs.  

SEE ALSO:  NINJA
        `;

        if (Pyro.instance === undefined) {
            Pyro.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Pyro {
        if (!Pyro.instance) {
            Pyro.instance = new Pyro();
        }
        return Pyro.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Pyro.GetInstance() as T;
    }
}

export default Pyro;