import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Caltraps from "@shared/types/ability-types/skills/caltraps";
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
import Backstab from "@shared/types/ability-types/skills/backstab";
import Detection from "../groups-spells/detection";
import FlashBomb from "@shared/types/ability-types/skills/flashbomb";

export class AssassinDefault implements IAbilityGroup {
  static instance: AssassinDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.AssassinDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Detection.GetInstance().Get<Detection>().abilities,
      Sneak.GetInstance().Get(),
      Caltraps.GetInstance().Get(),
      PoisonSmoke.GetInstance().Get(),
      FlashBomb.GetInstance().Get(),
      GroundControl.GetInstance().Get(),
      Disarm.GetInstance().Get(),
      Hide.GetInstance().Get(),
      Strangle.GetInstance().Get(),
      Vanish.GetInstance().Get(),
      Kurijitsu.GetInstance().Get(),
      Dodge.GetInstance().Get(),
      PoisonDagger.GetInstance().Get(),
      Nerve.GetInstance().Get(),
      HandToHand.GetInstance().Get(),
      Backstab.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): AssassinDefault {
    if (!AssassinDefault.instance) {
      AssassinDefault.instance = new AssassinDefault();
    }
    return AssassinDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AssassinDefault.GetInstance() as T;
  }
}

export default AssassinDefault;
