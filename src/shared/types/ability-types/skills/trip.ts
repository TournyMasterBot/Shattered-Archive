import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Trip implements IAbility {
    private static instance: Trip;

    name: string;
    helpFile: string;
    manualDescription?: string | undefined;
    duration?: number | undefined;
    effects?: SkillSpellEffects | undefined;
    group?: string | undefined;
    alternateKeyword?: string | undefined;
    recommendedHelpFileChanges?: string | undefined;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Trip";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `help trip
TRIP
Back by popular demand.  Trip is a somewhat dastardly attack, and involves
using any one of a number of methods to bring your opponent down to the ground.
Tripping large monsters is generally not a good idea, and agile ones will
find the attack easy to avoid.  Thieves and warriors may learn trip.`;

        if (Trip.instance === undefined) {
            Trip.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Trip {
        if (!Trip.instance) {
            Trip.instance = new Trip();
        }
        return Trip.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Trip.GetInstance() as T;
    }
}

export default Trip;