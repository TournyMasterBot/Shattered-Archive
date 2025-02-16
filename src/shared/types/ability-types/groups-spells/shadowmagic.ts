import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Umbra from "@shared/types/ability-types/spells/umbra";
import KayensShield from "@shared/types/ability-types/spells/kayens-shield";
import ShadowVision from "@shared/types/ability-types/spells/shadow-vision";
import Shadowcloak from "@shared/types/ability-types/spells/shadowcloak";
import StealMagic from "@shared/types/ability-types/spells/steal-magic";
import Shadowbolt from "@shared/types/ability-types/spells/shadowbolt";
import SummonShadow from "@shared/types/ability-types/spells/summon-shadow";
import HostOfGargoyles from "@shared/types/ability-types/spells/host-of-gargoyles";
import AcuteEvasion from "@shared/types/ability-types/spells/acute-evasion";
import NightTerror from "@shared/types/ability-types/spells/night-terror";
import Shadowlord from "@shared/types/ability-types/spells/shadowlord";
import PraiseTheProphecy from "@shared/types/ability-types/spells/praise-the-prophecy";
import RedirectSkill from "@shared/types/ability-types/spells/redirect-skill";
import Deflection from "@shared/types/ability-types/spells/deflection";
import ShadowWhisper from "@shared/types/ability-types/spells/shadow-whisper";
import ShadowVortex from "@shared/types/ability-types/spells/shadow-vortex";
import CreateCauldron from "@shared/types/ability-types/spells/create-cauldron";
import NightShield from "@shared/types/ability-types/spells/nightshield";

export class Shadowmagic implements IAbilityGroup {
    static instance: Shadowmagic;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.Shadowmagic;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilities = [
            Umbra.GetInstance().Get(),
            NightShield.GetInstance().Get(),
            KayensShield.GetInstance().Get(),
            ShadowVision.GetInstance().Get(),
            Shadowcloak.GetInstance().Get(),
            StealMagic.GetInstance().Get(),
            Shadowbolt.GetInstance().Get(),
            SummonShadow.GetInstance().Get(),
            HostOfGargoyles.GetInstance().Get(),
            AcuteEvasion.GetInstance().Get(),
            NightTerror.GetInstance().Get(),
            Shadowlord.GetInstance().Get(),
            PraiseTheProphecy.GetInstance().Get(),
            RedirectSkill.GetInstance().Get(),
            Deflection.GetInstance().Get(),
            ShadowWhisper.GetInstance().Get(),
            ShadowVortex.GetInstance().Get(),
            CreateCauldron.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): Shadowmagic {
        if (!Shadowmagic.instance) {
            Shadowmagic.instance = new Shadowmagic();
        }
        return Shadowmagic.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Shadowmagic.GetInstance() as T;
    }
}

export default Shadowmagic;
