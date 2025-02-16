import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class AnkleSmash implements IAbility {
    private static instance: AnkleSmash;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Ankle Smash";
        this.helpFile =
`ANKLE SMASH

Charlatans, well known for their trickery and devious abilities, use many
different tactics to help defeat their opponents in battle. One of these is
the ability to drive their own feet down into an opponent's feet or ankles,
thus causing the opponent to cry out in pain, and lose some ability to move
with speed and agility in battle.

See also : Help Charlatan`;

        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;

        if (AnkleSmash.instance === undefined) {
            AnkleSmash.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): AnkleSmash {
        if (!AnkleSmash.instance) {
            AnkleSmash.instance = new AnkleSmash();
        }
        return AnkleSmash.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return AnkleSmash.GetInstance() as T;
    }
}

export default AnkleSmash;