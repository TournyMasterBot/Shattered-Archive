import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Bushido implements IAbility {
    private static instance: Bushido;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Bushido";
        this.helpFile = `
help Bushido
bushido
BUSHIDO

Syntax: passive

Also known in Shokonese as the "way of the samurai". Bushido allows a
Samurai's violent existence to be tempered by wisdom and serenity. This
path follows a moral high ground, emphasizing frugality, obedience, duty,
loyalty and honor to the point of self-sacrifice. Following the code of
Bushido allows the Samurai martial mastery when dual wielding one-handed
swords. The Samurai uses her righteous fury to perform a rapid flurry of
strikes against her opponent. This is done by flicking the wrist to
maximize the number of strikes with minimal body movement.
`;
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;
        this.manualDescription = "";

        if (Bushido.instance === undefined) {
            Bushido.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Bushido {
        if (!Bushido.instance) {
            Bushido.instance = new Bushido();
        }
        return Bushido.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Bushido.GetInstance() as T;
    }
}

export default Bushido;