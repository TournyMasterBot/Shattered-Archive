import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CallDog implements IAbility {
  private static instance: CallDog;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Call Dog";
    this.helpFile = `
call dog
CALL DOG

Syntax: Call

Shokonese lore tell of pet dogs fighting alongside Samurai. While training
far from home, young Ronin are gifted with Akita puppies to ease their
loneliness. This tradition turned out to have an added perk as Akita
puppies have fiendishly sharp teeth and indomitable fighting spirits to
protect their masters. Around the same time Ronin gain enough seniority to
be accepted as Samurai, the Akita puppy reaches maturity and grows into a
full sized adult Akira. In the depths of ancient myths are whispers of
large Akira beasts so fearsome that only a Samurai who achieves the rank of
Shogun may control them.
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "";

    if (CallDog.instance === undefined) {
      CallDog.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CallDog {
    if (!CallDog.instance) {
      CallDog.instance = new CallDog();
    }
    return CallDog.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CallDog.GetInstance() as T;
  }
}

export default CallDog;
