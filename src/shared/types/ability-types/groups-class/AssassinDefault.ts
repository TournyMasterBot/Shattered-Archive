import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Caltraps from "@shared/types/ability-types/skills/Caltraps";
import PoisonSmoke from "@shared/types/ability-types/skills/poison-smoke";
import GroundControl from "@shared/types/ability-types/skills/ground-control";
import Disarm from "@shared/types/ability-types/skills/disarm";
import Hide from "@shared/types/ability-types/skills/hide";
import Strangle from "@shared/types/ability-types/skills/strangle";
import Vanish from "@shared/types/ability-types/skills/vanish";
import Kurijitsu from "@shared/types/ability-types/skills/kurijitsu";
import Dodge from "@shared/types/ability-types/skills/dodge";
import PoisonDagger from "@shared/types/ability-types/skills/poison-dagger";
import Nerve from "@shared/types/ability-types/skills/nerve";
import HandToHand from "@shared/types/ability-types/skills/hand-to-hand";
import Backstab from "@shared/types/ability-types/skills/Backstab";
import Detection from "../groups-spells/Detection";
import FlashBomb from "@shared/types/ability-types/skills/flashbomb";
import ServerCache from "@shared/cache/server-cache";

export class AssassinDefault implements IAbilityGroup {
  static instance: AssassinDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.AssassinDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Detection.GetInstance().abilities,
      Sneak.GetInstance(),
      Caltraps.GetInstance(),
      PoisonSmoke.GetInstance(),
      FlashBomb.GetInstance(),
      GroundControl.GetInstance(),
      Disarm.GetInstance(),
      Hide.GetInstance(),
      Strangle.GetInstance(),
      Vanish.GetInstance(),
      Kurijitsu.GetInstance(),
      Dodge.GetInstance(),
      PoisonDagger.GetInstance(),
      Nerve.GetInstance(),
      HandToHand.GetInstance(),
      Backstab.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): AssassinDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AssassinDefault.GetInstance() as T;
  }
}

export default AssassinDefault;
