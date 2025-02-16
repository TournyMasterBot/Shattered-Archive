import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Rack implements IAbility {
    private static instance: Rack;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Rack";
        this.helpFile =
        `RACK

A charlatan may, as a precursor to battle, or an act while engaged in
battle, attempt to rack an opponent. The charlatan, twisting quickly, uses
their held weapon in an attempt to drive it between the legs of an opponent,
causing unimaginable pain, and forcing the opponent to lose their presence
of mind for a moment.

Obviously, this is a benefit of the charlatan that only seems to work on the
male gender.

See also : Help Charlatan`;
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;

        if (Rack.instance === undefined) {
            Rack.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Rack {
        if (!Rack.instance) {
            Rack.instance = new Rack();
        }
        return Rack.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Rack.GetInstance() as T;
    }
}

export default Rack;